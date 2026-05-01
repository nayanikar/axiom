#!/usr/bin/env python3
"""Scan the bound Spacebase1 space and print recent INTENT/PROMISE/COMPLETE messages."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.services.spacebase import _restore_session_sync  # noqa: E402

sess = _restore_session_sync()
if sess is None:
    print("No on-disk enrollment — run claim first.")
    sys.exit(1)

space_id = sess.current_space_id or sess.declared_default_space_id
print(f"space: {space_id}")
print(f"endpoint: {sess.endpoint}")
print(f"agent: {sess.agent_id}")

def dump(label, scan):
    msgs = scan.get("messages", [])
    print(f"\n--- {label} ({len(msgs)} messages) ---")
    for m in msgs:
        t = m.get("type")
        iid = m.get("intentId") or ""
        pid = m.get("promiseId") or ""
        parent = m.get("parentId") or ""
        sender = m.get("senderId") or ""
        payload = m.get("payload") or {}
        content = (payload.get("content") or payload.get("summary") or "")[:60].replace("\n", " ")
        print(f"  {t:9} {(iid or pid)[:32]:32} parent={parent[:24]:24} sender={sender[:18]:18} {content}")
    return msgs


root_msgs = dump(f"space {space_id}", sess.scan_full(space_id))

def recurse(parent_id, depth=0):
    try:
        scan = sess.scan_full(parent_id)
    except Exception as exc:
        print(f"  ! could not scan {parent_id}: {exc}")
        return
    msgs = scan.get("messages", [])
    if not msgs:
        return
    indent = "  " * depth
    for m in msgs:
        t = m.get("type")
        iid = m.get("intentId") or ""
        pid = m.get("promiseId") or ""
        sender = m.get("senderId") or ""
        payload = m.get("payload") or {}
        content = (payload.get("content") or payload.get("summary") or "")[:50].replace("\n", " ")
        print(f"{indent}{t:9} {(iid or pid)[:32]:32} sender={sender[:18]:18} {content}")
        if t == "INTENT" and iid and iid.startswith("intent-"):
            recurse(iid, depth + 1)


print("\n=== full tree ===")
recurse(space_id)
