import asyncio
import json
import logging
import re
from typing import Optional

import httpx

from ..config import get_settings
from ..teachers import Teacher

log = logging.getLogger(__name__)

_ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
_MAX_RETRIES = 2


class AnthropicError(RuntimeError):
    pass


async def call_teacher(
    teacher: Teacher,
    topic: str,
    *,
    prior_context: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> str:
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise AnthropicError("ANTHROPIC_API_KEY is not configured (see backend/.env)")

    user_prompt = teacher.prompt(topic)
    if prior_context:
        snippet = prior_context.strip()
        if len(snippet) > 3000:
            snippet = snippet[:3000].rstrip() + "…"
        user_prompt = (
            f"{user_prompt}\n\n"
            "Other agents have already contributed:\n"
            f"{snippet}\n\n"
            "Build on or respond to what's there. Don't repeat what's been said."
        )

    payload = {
        "model": settings.anthropic_model,
        "max_tokens": 1000,
        "system": teacher.system,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    headers = {
        "Content-Type": "application/json",
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
    }

    own_client = client is None
    if own_client:
        client = httpx.AsyncClient(timeout=httpx.Timeout(60.0))

    try:
        for attempt in range(_MAX_RETRIES + 1):
            try:
                resp = await client.post(_ANTHROPIC_URL, json=payload, headers=headers)
            except httpx.HTTPError as exc:
                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(0.5 * (2**attempt))
                    continue
                raise AnthropicError(f"Network error calling Anthropic: {exc}") from exc

            if resp.status_code == 429 and attempt < _MAX_RETRIES:
                await asyncio.sleep(1.0 * (2**attempt))
                continue

            if resp.status_code >= 400:
                try:
                    err = resp.json().get("error", {}).get("message")
                except Exception:
                    err = resp.text[:200]
                raise AnthropicError(f"Anthropic {resp.status_code}: {err}")

            data = resp.json()
            blocks = data.get("content") or []
            for block in blocks:
                if block.get("type") == "text":
                    return block.get("text", "")
            return ""
        raise AnthropicError("Anthropic call failed after retries")
    finally:
        if own_client:
            await client.aclose()


# ---------------------------------------------------------------------------
# Cartographer: graph extraction helper
# ---------------------------------------------------------------------------

_GRAPH_SYSTEM = (
    "You are a knowledge cartographer. Given a topic and what several teachers said about it, "
    "extract a tiny structured map of the surrounding intellectual landscape. "
    "Respond ONLY with a single JSON object — no preamble, no code fences, no commentary. "
    "Schema:\n"
    "{\n"
    '  "fields": [{"label": "<domain or discipline, 1-3 words>"}],   // up to 3\n'
    '  "concepts": [{"label": "<adjacent idea, 1-3 words>"}],          // up to 3\n'
    '  "links": [{"to": "<peer topic label as written>", "type": "extends|relates|surprising"}]  // up to 3\n'
    "}\n"
    "Pick `surprising` for non-obvious connections that delight. "
    "Only emit links whose `to` is one of the peer topic labels supplied to you (verbatim)."
)


def _extract_first_json(text: str) -> Optional[dict]:
    """Pluck the first JSON object out of a possibly-fenced LLM reply."""
    if not text:
        return None
    # Strip ```json ... ``` fences if present.
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    # Otherwise grab the first {...} block.
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    snippet = text[start : end + 1]
    try:
        parsed = json.loads(snippet)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _coerce_label_list(items: object, max_items: int) -> list[dict]:
    out: list[dict] = []
    if not isinstance(items, list):
        return out
    for entry in items[:max_items]:
        if isinstance(entry, dict):
            label = entry.get("label")
        elif isinstance(entry, str):
            label = entry
        else:
            label = None
        if isinstance(label, str) and label.strip():
            out.append({"label": label.strip()[:120]})
    return out


def _coerce_links(items: object, peer_labels: set[str], max_items: int) -> list[dict]:
    out: list[dict] = []
    if not isinstance(items, list):
        return out
    peers_lower = {p.lower(): p for p in peer_labels}
    for entry in items[:max_items]:
        if not isinstance(entry, dict):
            continue
        to = entry.get("to")
        et = entry.get("type")
        if not isinstance(to, str) or not isinstance(et, str):
            continue
        match = peers_lower.get(to.strip().lower())
        if not match:
            continue
        if et not in {"extends", "relates", "surprising"}:
            et = "relates"
        out.append({"to": match, "type": et})
    return out


async def extract_graph(
    topic_text: str,
    responses_text: str,
    peer_topic_labels: list[str],
    *,
    client: Optional[httpx.AsyncClient] = None,
) -> dict:
    """Ask Anthropic for a small Field/Concept/Link map for one topic.

    Returns a dict with keys `fields`, `concepts`, `links`. Always returns a
    dict; on parse failure fields/concepts/links may be empty lists.
    """
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise AnthropicError("ANTHROPIC_API_KEY is not configured (see backend/.env)")

    peers_block = (
        "\n".join(f"- {p}" for p in peer_topic_labels) if peer_topic_labels else "(none)"
    )
    user = (
        f"Topic: {topic_text}\n\n"
        f"What teachers said:\n{responses_text[:3000]}\n\n"
        f"Peer topics (use these verbatim if you cite a link `to`):\n{peers_block}\n\n"
        "Return the JSON object now."
    )

    payload = {
        "model": settings.anthropic_model,
        "max_tokens": 600,
        "system": _GRAPH_SYSTEM,
        "messages": [{"role": "user", "content": user}],
    }
    headers = {
        "Content-Type": "application/json",
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
    }

    own_client = client is None
    if own_client:
        client = httpx.AsyncClient(timeout=httpx.Timeout(45.0))

    try:
        for attempt in range(_MAX_RETRIES + 1):
            try:
                resp = await client.post(_ANTHROPIC_URL, json=payload, headers=headers)
            except httpx.HTTPError as exc:
                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(0.5 * (2**attempt))
                    continue
                raise AnthropicError(f"Network error calling Anthropic: {exc}") from exc
            if resp.status_code == 429 and attempt < _MAX_RETRIES:
                await asyncio.sleep(1.0 * (2**attempt))
                continue
            if resp.status_code >= 400:
                try:
                    err = resp.json().get("error", {}).get("message")
                except Exception:
                    err = resp.text[:200]
                raise AnthropicError(f"Anthropic {resp.status_code}: {err}")
            data = resp.json()
            blocks = data.get("content") or []
            text_out = ""
            for block in blocks:
                if block.get("type") == "text":
                    text_out = block.get("text", "")
                    break
            parsed = _extract_first_json(text_out) or {}
            return {
                "fields": _coerce_label_list(parsed.get("fields"), max_items=3),
                "concepts": _coerce_label_list(parsed.get("concepts"), max_items=3),
                "links": _coerce_links(
                    parsed.get("links"), set(peer_topic_labels), max_items=3
                ),
            }
        raise AnthropicError("Anthropic graph extraction failed after retries")
    finally:
        if own_client:
            await client.aclose()
