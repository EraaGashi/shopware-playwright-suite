#!/usr/bin/env bash
# Runs the suite for ONE shop inside Bitbucket Pipelines (called from bitbucket-pipelines.yml).
#   bash ci/e2e.sh smoke   → @smoke tests, chromium only
#   bash ci/e2e.sh full    → every test: setup, chromium + mobile, all 4 responsive viewports, cleanup
# The shop's settings (BASE_URL, credentials …) come from the step's deployment environment;
# PROJECT defaults to the environment's name (mallstreet, echonut, wurth).
set -euo pipefail

MODE="${1:-full}"
export CI=true
export PROJECT="${PROJECT:-${BITBUCKET_DEPLOYMENT_ENVIRONMENT:-demo}}"

args=()
if [ "$MODE" = "smoke" ]; then
  args+=(--grep @smoke --project=chromium)
fi
# manual runs: "Run pipeline" → variable TEST_GREP, e.g. @checkout or "Product search"
if [ -n "${TEST_GREP:-}" ]; then args+=(--grep "$TEST_GREP"); fi
# shops that rate-limit parallel browsers (HTTP 429): set WORKERS=1 in their deployment environment
if [ -n "${WORKERS:-}" ]; then args+=(--workers="$WORKERS"); fi

echo "Shop: $PROJECT | URL: ${BASE_URL:-profile default} | mode: $MODE${TEST_GREP:+ | grep: $TEST_GREP} | headed: ${HEADED:-false}"

npm ci
# HEADED=true: real browser window on a virtual display — for shops whose bot protection blocks headless browsers
if [ "${HEADED:-false}" = "true" ]; then
  xvfb-run -a npx playwright test --headed "${args[@]}"
else
  npx playwright test "${args[@]}"
fi
