#!/usr/bin/env bash
# Opens one macOS Terminal window per shop and runs the suite there with that shop's env file.
#   npm run test:all                       → wurth, dino, lebeaux, miniature, bg
#   npm run test:all -- wurth dino         → only these (.env.wurth, .env.dino)
#   npm run test:all -- wurth -- --grep @smoke   → extra args after -- go to playwright
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

shops=()
while [[ $# -gt 0 && "$1" != "--" ]]; do shops+=("$1"); shift; done
[[ "${1:-}" == "--" ]] && shift
extra="$*"
[[ ${#shops[@]} -eq 0 ]] && shops=(wurth dino lebeaux miniature bg)

for shop in "${shops[@]}"; do
  if [[ ! -f "$root/.env.$shop" ]]; then
    echo "skip $shop: .env.$shop not found" >&2
    continue
  fi
  cmd="cd '$root' && ENV_FILE=.env.$shop npx playwright test $extra"
  osascript -e "tell application \"Terminal\" to do script \"$cmd\"" >/dev/null
  echo "started $shop"
done
osascript -e 'tell application "Terminal" to activate'
