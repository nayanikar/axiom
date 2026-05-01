#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  ./.venv/bin/pip install -U pip
  ./.venv/bin/pip install -e .
fi
exec ./.venv/bin/uvicorn app.main:app --reload --port 8000 --host 127.0.0.1
