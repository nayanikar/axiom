"""Independent stigmergic AgentWorker.

Each Teacher gets one worker that ticks on its own schedule, reads the shared
SpaceSnapshot, self-selects an unclaimed topic, posts PROMISE → COMPLETE
through the Spacebase1 SDK, and may stigmergically spawn child intents that
seed new Topics for siblings to discover.

All seven workers share a single station identity (the bound Spacebase1
agent). Each worker tags its messages with its own virtual `agentId` so the
Observatory can colour them differently.
"""
from __future__ import annotations

import asyncio
import logging
import random
import secrets
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import func as asyncfunc, select

from ..config import get_settings
from ..db import AsyncSessionLocal
from ..runtime_pause import get_agents_paused
from ..events import broker
from ..models import AgentResponse, IntentEvent, Topic, WorkerState
from ..teachers import Teacher
from . import spacebase
from .anthropic import AnthropicError, call_teacher
from .space_watcher import SpaceSnapshot, SpaceWatcher

log = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AgentWorker:
    def __init__(self, teacher: Teacher, watcher: SpaceWatcher) -> None:
        self.teacher = teacher
        self.watcher = watcher
        self.worker_agent_id = f"{teacher.id}-{secrets.token_hex(4)}"
        settings = get_settings()
        self.interval_s = settings.interval_for(teacher.id)
        self.daily_cap = settings.worker_daily_cap
        self.max_children = settings.topic_max_children
        self.max_depth = settings.topic_max_depth
        self.claimed: set[str] = set()
        self._stop = asyncio.Event()
        self._task: Optional[asyncio.Task] = None

    # ------------------------------------------------------------------ run

    async def run(self) -> None:
        await asyncio.sleep(random.uniform(0, 3))
        log.info(
            "AgentWorker %s started (interval=%ss, agentId=%s)",
            self.teacher.id,
            self.interval_s,
            self.worker_agent_id,
        )
        try:
            while not self._stop.is_set():
                try:
                    await self._tick()
                except Exception as exc:  # noqa: BLE001
                    log.exception("Worker %s tick crashed: %s", self.teacher.id, exc)
                    await self._publish("agent.error", {"error": str(exc)})
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=self.interval_s)
                except asyncio.TimeoutError:
                    continue
                else:
                    break
        finally:
            log.info("AgentWorker %s stopped", self.teacher.id)

    def start(self) -> asyncio.Task:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(
                self.run(), name=f"worker-{self.teacher.id}"
            )
        return self._task

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=5.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                self._task.cancel()

    # ------------------------------------------------------------- one tick

    async def _tick(self) -> None:
        await self._update_state(status="scanning", last_poll_at=_utcnow())
        await self._publish("agent.scanning", self._state_payload())

        if await self._over_daily_cap():
            await self._update_state(status="sleeping")
            await self._publish("agent.idle", self._state_payload(reason="daily-cap"))
            return

        if await get_agents_paused():
            await self._update_state(status="sleeping")
            await self._publish(
                "agent.idle", self._state_payload(reason="coffee-break")
            )
            return

        snapshot = self.watcher.snapshot

        async with AsyncSessionLocal() as db:
            topics = (
                await db.execute(
                    select(Topic).order_by(Topic.created_at.asc())
                )
            ).scalars().all()

            # Compose teacher-done map from local DB (authoritative for our
            # process) and union with any extra info the snapshot has from
            # Spacebase1. The snapshot is the only way to see other stations'
            # COMPLETEs, but in simulated mode it's empty.
            done_rows = (
                await db.execute(
                    select(AgentResponse.topic_id, AgentResponse.teacher_id)
                    .where(AgentResponse.status == "done")
                )
            ).all()
            done_map_by_topic_id: dict[str, set[str]] = {}
            for row in done_rows:
                done_map_by_topic_id.setdefault(row.topic_id, set()).add(row.teacher_id)

            picked = self._select_topic(topics, snapshot, done_map_by_topic_id)
            if picked is None:
                await self._update_state(status="sleeping")
                await self._publish("agent.idle", self._state_payload())
                return

            if picked.id in self.claimed:
                await self._update_state(status="sleeping")
                return
            self.claimed.add(picked.id)

            existing = (
                await db.execute(
                    select(AgentResponse).where(
                        AgentResponse.topic_id == picked.id,
                        AgentResponse.teacher_id == self.teacher.id,
                    )
                )
            ).scalar_one_or_none()
            if existing is not None:
                # Some other tick already started/finished us; bail.
                self.claimed.discard(picked.id)
                return

            response = AgentResponse(
                topic_id=picked.id,
                teacher_id=self.teacher.id,
                worker_agent_id=self.worker_agent_id,
                status="responding",
            )
            db.add(response)

            picked.status = self._next_topic_status(picked, claimed=True)
            db.add(IntentEvent(
                topic_id=picked.id,
                type="CLAIM",
                teacher_id=self.teacher.id,
                intent_id=picked.root_intent_id,
                text=picked.text,
                payload={"agentId": self.worker_agent_id},
            ))
            await db.commit()
            await db.refresh(response)

            await self._update_state(
                status="working",
                last_picked_topic_id=picked.id,
                last_picked_at=_utcnow(),
            )
            await self._publish(
                "topic.claimed",
                {"topic_id": picked.id, "teacher_id": self.teacher.id, "agent_id": self.worker_agent_id},
            )
            await self._publish(
                "agent.working",
                self._state_payload(topic_id=picked.id, topic_text=picked.text),
            )
            await self._publish(
                "topic.responding",
                {"topic_id": picked.id, "teacher_id": self.teacher.id, "worker_agent_id": self.worker_agent_id},
            )

        # Run the LLM + Spacebase1 dance outside the DB transaction so we don't
        # hold a connection across a slow API call.
        try:
            response_id = response.id
            topic_id = picked.id
            topic_text = picked.text
            root_intent_id = picked.root_intent_id
            depth = picked.depth
            prior_context = self._build_context(snapshot, picked)

            text = await call_teacher(self.teacher, topic_text, prior_context=prior_context)

            promise = await spacebase.post_promise(
                None,
                intent_id=root_intent_id or topic_id,
                text=f"{self.teacher.name} ({self.teacher.role}): I'll respond.",
                payload={
                    "agentId": self.worker_agent_id,
                    "agentName": self.teacher.name,
                    "teacherId": self.teacher.id,
                    "role": self.teacher.role,
                },
            )

            complete = await spacebase.post_complete(
                None,
                intent_id=root_intent_id or topic_id,
                promise_id=promise.promise_id,
                text=text[:500],
                payload={
                    "agentId": self.worker_agent_id,
                    "agentName": self.teacher.name,
                    "teacherId": self.teacher.id,
                    "role": self.teacher.role,
                    "fullResponse": text,
                },
            )

            async with AsyncSessionLocal() as db:
                row = await db.get(AgentResponse, response_id)
                if row is not None:
                    row.text = text
                    row.intent_id = root_intent_id
                    row.promise_id = promise.promise_id
                    row.complete_id = complete.raw.get("promiseId") if complete.raw else None
                    row.status = "done"
                    row.finished_at = _utcnow()
                topic = await db.get(Topic, topic_id)
                if topic is not None:
                    done_count = await db.scalar(
                        select(asyncfunc.count())
                        .select_from(AgentResponse)
                        .where(
                            AgentResponse.topic_id == topic_id,
                            AgentResponse.status == "done",
                        )
                    ) or 0
                    if done_count >= 7:
                        topic.status = "done"
                    else:
                        topic.status = "responding"
                db.add(IntentEvent(
                    topic_id=topic_id, type="PROMISE", teacher_id=self.teacher.id,
                    intent_id=root_intent_id, parent_id=root_intent_id,
                    text=f"{self.teacher.name} promise",
                    payload={"agentId": self.worker_agent_id},
                ))
                db.add(IntentEvent(
                    topic_id=topic_id, type="COMPLETE", teacher_id=self.teacher.id,
                    intent_id=root_intent_id, parent_id=root_intent_id,
                    text=text[:500],
                    payload={"agentId": self.worker_agent_id, "agentName": self.teacher.name},
                ))
                await db.commit()

            await self._increment_calls()
            await self._publish(
                "topic.responded",
                {
                    "topic_id": topic_id,
                    "teacher_id": self.teacher.id,
                    "worker_agent_id": self.worker_agent_id,
                    "text": text,
                    "intent_id": root_intent_id,
                },
            )
            await self._publish("agent.idle", self._state_payload())
            await self._update_state(status="sleeping")

            # Stigmergic spawn (capped). Run after the COMPLETE so other workers
            # can observe this teacher's contribution before deciding to spawn.
            await self._maybe_spawn(topic_id, topic_text, depth)

        except AnthropicError as exc:
            log.warning("Worker %s anthropic error: %s", self.teacher.id, exc)
            await self._mark_response_error(response.id, picked.id, str(exc))
        except Exception as exc:  # noqa: BLE001
            log.exception("Worker %s failed", self.teacher.id)
            await self._mark_response_error(response.id, picked.id, str(exc))
        finally:
            self.claimed.discard(picked.id)

    # ----------------------------------------------------------- selection

    def _select_topic(
        self,
        topics: list[Topic],
        snap: SpaceSnapshot,
        done_map_by_topic_id: dict[str, set[str]],
    ) -> Optional[Topic]:
        # Build per-topic teacher COMPLETE map. Start with the local DB
        # (authoritative when in simulated mode) and union the snapshot.
        teacher_done_per_topic: dict[str, set[str]] = {
            tid: set(s) for tid, s in done_map_by_topic_id.items()
        }
        # The snapshot keys completes by intent_id (parentId of the COMPLETE).
        # We map them back to topic_id so worker selection has a single key.
        intent_to_topic: dict[str, str] = {
            t.root_intent_id: t.id for t in topics if t.root_intent_id
        }
        for c in snap.completes:
            payload = c.get("payload") or {}
            tid = payload.get("teacherId") if isinstance(payload, dict) else None
            parent = c.get("parentId")
            if not (isinstance(tid, str) and isinstance(parent, str)):
                continue
            topic_key = intent_to_topic.get(parent)
            if topic_key is None:
                continue
            teacher_done_per_topic.setdefault(topic_key, set()).add(tid)

        eligible: list[Topic] = []
        for topic in topics:
            if topic.status in {"capped", "done"}:
                continue
            if topic.depth > self.max_depth:
                continue
            if self._subtree_count(topics, topic) > self.max_children:
                continue
            done_set = teacher_done_per_topic.get(topic.id, set())
            if self.teacher.id in done_set:
                continue
            eligible.append(topic)

        if not eligible:
            return None

        return self._teacher_specific_pick(eligible, teacher_done_per_topic, topics)

    def _teacher_specific_pick(
        self,
        eligible: list[Topic],
        teacher_done: dict[str, set[str]],
        all_topics: list[Topic],
    ) -> Optional[Topic]:
        tid = self.teacher.id
        # sort oldest first
        eligible_sorted = sorted(eligible, key=lambda t: t.created_at)
        user_queue = [t for t in eligible_sorted if t.source == "user-queue"]

        def has_completed(topic: Topic, teacher_id: str) -> bool:
            return teacher_id in teacher_done.get(topic.id, set())

        # Anchor prefers an unclaimed user-queue topic, but will help close out
        # spawned traces too (otherwise spawned topics never reach 7/7 done).
        if tid == "anchor":
            unclaimed_users = [t for t in user_queue if t.status == "queued"]
            if unclaimed_users:
                return unclaimed_users[0]
            if user_queue:
                return user_queue[0]
            return eligible_sorted[0] if eligible_sorted else None
        if tid == "challenger":
            for t in eligible_sorted:
                if has_completed(t, "anchor"):
                    return t
            return eligible_sorted[0] if eligible_sorted else None
        if tid == "historian":
            return random.choice(eligible_sorted) if eligible_sorted else None
        if tid == "analogy":
            longish = [t for t in eligible_sorted if len(t.text.split()) > 3]
            return longish[0] if longish else (eligible_sorted[0] if eligible_sorted else None)
        # Connector waits for ≥2 active user-queue topics before joining the
        # main floor; if no user-queue activity is happening, it'll still help
        # finish off open spawned traces.
        if tid == "connector":
            active_users = [t for t in user_queue if t.status in {"queued", "claimed", "responding"}]
            if len(active_users) >= 2:
                return eligible_sorted[0]
            spawned = [t for t in eligible_sorted if t.source == "agent-trace"]
            return spawned[0] if spawned else None
        if tid == "practical":
            for t in eligible_sorted:
                if has_completed(t, "anchor") and has_completed(t, "challenger"):
                    return t
            return None
        if tid == "quiz":
            for t in eligible_sorted:
                if len(teacher_done.get(t.id, set())) >= 3:
                    return t
            return None
        return eligible_sorted[0] if eligible_sorted else None

    def _subtree_count(self, all_topics: list[Topic], root: Topic) -> int:
        # number of descendants (rough proxy for spawned-children cap)
        if root.parent_topic_id is None:
            ancestor_id = root.id
        else:
            # find the user-queue ancestor
            current = root
            by_id = {t.id: t for t in all_topics}
            while current.parent_topic_id and current.parent_topic_id in by_id:
                current = by_id[current.parent_topic_id]
            ancestor_id = current.id

        count = 0
        for t in all_topics:
            cur = t
            by_id = {x.id: x for x in all_topics}
            depth = 0
            while cur.parent_topic_id and cur.parent_topic_id in by_id and depth < 10:
                cur = by_id[cur.parent_topic_id]
                depth += 1
            if cur.id == ancestor_id and t.id != ancestor_id:
                count += 1
        return count

    # ---------------------------------------------------------- context

    def _build_context(self, snap: SpaceSnapshot, topic: Topic) -> Optional[str]:
        if not topic.root_intent_id:
            return None
        completes = snap.completes_for(topic.root_intent_id)
        if not completes:
            return None
        chunks: list[str] = []
        running = 0
        for c in completes:
            payload = c.get("payload") or {}
            if not isinstance(payload, dict):
                continue
            who = payload.get("agentName") or payload.get("teacherId") or payload.get("agentId") or "agent"
            text = payload.get("fullResponse") or payload.get("summary") or ""
            if not isinstance(text, str) or not text.strip():
                continue
            entry = f"[{who}] {text.strip()}"
            running += len(entry)
            if running > 3000:
                break
            chunks.append(entry)
        return "\n\n".join(chunks) if chunks else None

    # ------------------------------------------------------------ spawn

    async def _maybe_spawn(self, topic_id: str, topic_text: str, depth: int) -> None:
        if self.teacher.id not in {"connector", "historian"}:
            return
        if depth >= self.max_depth:
            return

        async with AsyncSessionLocal() as db:
            topic = await db.get(Topic, topic_id)
            if topic is None:
                return
            all_topics = (
                await db.execute(select(Topic))
            ).scalars().all()
            if self._subtree_count(all_topics, topic) >= self.max_children:
                topic.status = "capped"
                await db.commit()
                await self._publish("topic.capped", {"topic_id": topic_id})
                return

            if self.teacher.id == "connector":
                spawned_text = f"Explore further: a deeper angle on '{topic_text}'"
            else:  # historian
                user_topics = [t for t in all_topics if t.source == "user-queue"]
                if len(user_topics) < 2:
                    return
                others = [t for t in user_topics if t.id != topic_id]
                if not others:
                    return
                pair = random.sample(others, k=min(1, len(others)))
                spawned_text = (
                    f"Pattern noticed: '{topic_text}' and '{pair[0].text}'"
                )

            new_topic_id = secrets.token_hex(8)
            payload_root = topic.root_intent_id or new_topic_id
            posted = await spacebase.post_intent(
                None,
                text=spawned_text,
                parent_id=payload_root,
                payload={
                    "source": "agent-trace",
                    "status": "unclaimed",
                    "agentId": self.worker_agent_id,
                    "agentName": self.teacher.name,
                    "teacherId": self.teacher.id,
                    "depth": depth + 1,
                    "spawnedFrom": topic_id,
                },
            )
            spawned = Topic(
                id=new_topic_id,
                text=spawned_text,
                root_intent_id=posted.intent_id,
                status="queued",
                source="agent-trace",
                parent_topic_id=topic_id,
                spawned_by_teacher_id=self.teacher.id,
                depth=depth + 1,
            )
            db.add(spawned)
            db.add(IntentEvent(
                topic_id=new_topic_id, type="INTENT", teacher_id=self.teacher.id,
                intent_id=posted.intent_id, parent_id=payload_root, text=spawned_text,
                payload={"source": "agent-trace", "agentId": self.worker_agent_id},
            ))
            await db.commit()

        await self._publish(
            "topic.spawned",
            {
                "topic_id": new_topic_id,
                "parent_topic_id": topic_id,
                "spawned_by_teacher_id": self.teacher.id,
                "agent_id": self.worker_agent_id,
                "text": spawned_text,
                "depth": depth + 1,
            },
        )

    # ------------------------------------------------------- worker state

    def _next_topic_status(self, topic: Topic, *, claimed: bool) -> str:
        if claimed:
            return "responding"
        # if every teacher has responded, mark done; otherwise responding/claimed
        return "responding"

    async def _update_state(self, **fields) -> None:
        async with AsyncSessionLocal() as db:
            row = (
                await db.execute(
                    select(WorkerState).where(WorkerState.teacher_id == self.teacher.id)
                )
            ).scalar_one_or_none()
            if row is None:
                row = WorkerState(
                    teacher_id=self.teacher.id,
                    worker_agent_id=self.worker_agent_id,
                )
                db.add(row)
            for k, v in fields.items():
                setattr(row, k, v)
            await db.commit()

    async def _over_daily_cap(self) -> bool:
        today = date.today()
        async with AsyncSessionLocal() as db:
            row = (
                await db.execute(
                    select(WorkerState).where(WorkerState.teacher_id == self.teacher.id)
                )
            ).scalar_one_or_none()
            if row is None:
                return False
            if row.day_bucket != today:
                row.day_bucket = today
                row.calls_today = 0
                await db.commit()
            return row.calls_today >= self.daily_cap

    async def _increment_calls(self) -> None:
        today = date.today()
        async with AsyncSessionLocal() as db:
            row = (
                await db.execute(
                    select(WorkerState).where(WorkerState.teacher_id == self.teacher.id)
                )
            ).scalar_one_or_none()
            if row is None:
                row = WorkerState(
                    teacher_id=self.teacher.id,
                    worker_agent_id=self.worker_agent_id,
                    day_bucket=today,
                    calls_today=1,
                )
                db.add(row)
            else:
                if row.day_bucket != today:
                    row.day_bucket = today
                    row.calls_today = 0
                row.calls_today += 1
            await db.commit()

    async def _mark_response_error(self, response_id: int, topic_id: str, msg: str) -> None:
        async with AsyncSessionLocal() as db:
            row = await db.get(AgentResponse, response_id)
            if row is not None:
                row.status = "error"
                row.error = msg
                row.finished_at = _utcnow()
            topic = await db.get(Topic, topic_id)
            if topic is not None and topic.status == "responding":
                topic.status = "queued"
            await db.commit()
        await self._update_state(status="sleeping", last_error=msg)
        await self._publish(
            "agent.error",
            {"teacher_id": self.teacher.id, "topic_id": topic_id, "error": msg},
        )

    def _state_payload(self, **extra) -> dict:
        return {
            "teacher_id": self.teacher.id,
            "worker_agent_id": self.worker_agent_id,
            "interval_s": self.interval_s,
            "daily_cap": self.daily_cap,
            **extra,
        }

    async def _publish(self, event_type: str, data: dict) -> None:
        await broker.publish(event_type, data)
