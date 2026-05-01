#!/usr/bin/env python3
"""Thin shim that calls the Axiom backend's /api/space/claim endpoint.

The original standalone claim flow now lives in the backend so the station
token is only ever stored server-side (in SQLite). Run the backend, then run
this script with a claim URL.
"""
import json
import sys

import requests

BACKEND = "http://127.0.0.1:8000"


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python3 claim_space.py <CLAIM_URL> [agent_name]")
        print("Make sure the backend is running (cd backend && ./run.sh)")
        return 2

    claim_url = sys.argv[1]
    agent_name = sys.argv[2] if len(sys.argv) > 2 else None

    body = {"claim_url": claim_url}
    if agent_name:
        body["agent_name"] = agent_name

    try:
        resp = requests.post(f"{BACKEND}/api/space/claim", json=body, timeout=20)
    except requests.RequestException as exc:
        print(f"Could not reach backend at {BACKEND}: {exc}")
        return 1

    print(f"Status: {resp.status_code}")
    try:
        print(json.dumps(resp.json(), indent=2))
    except ValueError:
        print(resp.text)
    return 0 if resp.ok else 1


if __name__ == "__main__":
    sys.exit(main())
