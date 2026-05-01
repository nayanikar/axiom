from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Topic(Base):
    """A queued INTENT — either dropped by the user or stigmergically spawned by an agent."""

    __tablename__ = "topics"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    root_intent_id: Mapped[Optional[str]] = mapped_column(String(96))
    status: Mapped[str] = mapped_column(String(16), default="queued")
    # queued | claimed | responding | done | capped
    source: Mapped[str] = mapped_column(String(24), default="user-queue")
    # user-queue | agent-trace
    parent_topic_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("topics.id", ondelete="CASCADE"), index=True
    )
    spawned_by_teacher_id: Mapped[Optional[str]] = mapped_column(String(32))
    depth: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    cartographed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_cartograph_error: Mapped[Optional[str]] = mapped_column(Text)

    responses: Mapped[list["AgentResponse"]] = relationship(
        back_populates="topic",
        cascade="all, delete-orphan",
        order_by="AgentResponse.id",
    )


class AgentResponse(Base):
    """Created when an AgentWorker claims a topic; updated on COMPLETE."""

    __tablename__ = "agent_responses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    topic_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("topics.id", ondelete="CASCADE"), index=True
    )
    teacher_id: Mapped[str] = mapped_column(String(32), nullable=False)
    worker_agent_id: Mapped[str] = mapped_column(String(48), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="responding")
    # responding | done | error
    text: Mapped[Optional[str]] = mapped_column(Text)
    intent_id: Mapped[Optional[str]] = mapped_column(String(96))
    promise_id: Mapped[Optional[str]] = mapped_column(String(96))
    complete_id: Mapped[Optional[str]] = mapped_column(String(96))
    error: Mapped[Optional[str]] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    topic: Mapped[Topic] = relationship(back_populates="responses")


class WorkerState(Base):
    """One row per teacher; updated by the AgentWorker as it ticks."""

    __tablename__ = "worker_states"

    teacher_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    worker_agent_id: Mapped[str] = mapped_column(String(48), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="sleeping")
    # sleeping | scanning | working
    last_poll_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_picked_topic_id: Mapped[Optional[str]] = mapped_column(String(64))
    last_picked_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_error: Mapped[Optional[str]] = mapped_column(Text)
    calls_today: Mapped[int] = mapped_column(Integer, default=0)
    day_bucket: Mapped[Optional[datetime]] = mapped_column(Date)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
    )


class IntentEvent(Base):
    """Audit log of every Spacebase1 message we send."""

    __tablename__ = "intent_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    topic_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("topics.id", ondelete="SET NULL"), index=True
    )
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    teacher_id: Mapped[Optional[str]] = mapped_column(String(32))
    intent_id: Mapped[Optional[str]] = mapped_column(String(96))
    parent_id: Mapped[Optional[str]] = mapped_column(String(128))
    text: Mapped[Optional[str]] = mapped_column(Text)
    payload: Mapped[Optional[dict]] = mapped_column(JSON)
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class GraphNode(Base):
    """A node in the knowledge graph (a topic, a field, or a concept)."""

    __tablename__ = "graph_nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    # topic | field | concept
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    label_key: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    # lower-cased label, used for de-duplication across topics
    topic_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("topics.id", ondelete="CASCADE"), index=True
    )
    source_topic_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("topics.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class GraphEdge(Base):
    """A typed edge between two graph nodes."""

    __tablename__ = "graph_edges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    from_node_id: Mapped[int] = mapped_column(
        ForeignKey("graph_nodes.id", ondelete="CASCADE"), index=True
    )
    to_node_id: Mapped[int] = mapped_column(
        ForeignKey("graph_nodes.id", ondelete="CASCADE"), index=True
    )
    edge_type: Mapped[str] = mapped_column(String(16), nullable=False)
    # extends | relates | surprising | spawned
    source_topic_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("topics.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class SpaceBinding(Base):
    __tablename__ = "space_binding"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    space_id: Mapped[Optional[str]] = mapped_column(String(128))
    origin: Mapped[Optional[str]] = mapped_column(String(255))
    agent_id: Mapped[Optional[str]] = mapped_column(String(96))
    agent_name: Mapped[Optional[str]] = mapped_column(String(64))
    station_token: Mapped[Optional[str]] = mapped_column(Text)
    observatory_url: Mapped[Optional[str]] = mapped_column(Text)
    raw_response: Mapped[Optional[dict]] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
    )
