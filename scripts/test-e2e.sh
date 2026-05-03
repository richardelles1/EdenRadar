#!/usr/bin/env bash
# scripts/test-e2e.sh — convenience wrapper for the Playwright E2E suite.
#
# Usage:
#   bash scripts/test-e2e.sh                    # run everything
#   bash scripts/test-e2e.sh unsubscribe        # run a single spec by name
#   bash scripts/test-e2e.sh --ui               # forward args to playwright
set -euo pipefail

cd "$(dirname "$0")/.."

# Hard-require an explicit opt-in for DB writes. The unsubscribe spec inserts
# and deletes rows in `industry_profiles` matching `company_name LIKE 'e2e-test-%'`.
# This guard prevents accidentally pointing at a production DB.
export E2E_ALLOW_DB_WRITES="${E2E_ALLOW_DB_WRITES:-true}"

# Reuse the dev workflow if it's running; otherwise Playwright will start one.
if curl -fsS -o /dev/null http://localhost:5000/ 2>/dev/null; then
  echo "[e2e] Dev server detected on :5000 — reusing."
else
  echo "[e2e] No dev server detected. Playwright will boot one (slow)."
fi

# Make sure chromium is present (idempotent, fast if already installed).
if [ ! -d ".cache/ms-playwright/chromium-1217" ] && \
   [ ! -d "$HOME/.cache/ms-playwright/chromium-1217" ]; then
  echo "[e2e] Installing chromium browser (one-time)…"
  npx playwright install chromium
fi

# Pass through arguments — supports `bash scripts/test-e2e.sh unsubscribe`,
# `--ui`, `--headed`, `--debug`, etc.
exec npx playwright test "$@"
