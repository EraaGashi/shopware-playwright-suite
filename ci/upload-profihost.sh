#!/usr/bin/env bash
# Uploads one run's summary.json (+ results.json) to Profihost for the central QA report (built at 19:00 UTC).
#   bash ci/upload-profihost.sh [qa-report/summary.json] [qa-report/results.json]
#
# Secrets (env): PROFIHOST_HOST, PROFIHOST_USER, PROFIHOST_SSH_KEY (ed25519 private key),
#                PROFIHOST_KNOWN_HOSTS (ssh-keyscan output; for a non-22 port: ssh-keyscan -p <port> <host>),
#                PROFIHOST_PORT (optional, default 22)
# No PROFIHOST_HOST → skipped with a notice (exit 0). Host set but anything else missing, or sftp fails → warning, exit 1.
# Destination: qa-reports/<project>/<environment>/<YYYY-MM-DD>/<HHMMSS>/ with date + time from summary.json's timestamp.
# Uses sftp -b only (the account may be SFTP-only). Secrets are written to files, never echoed.
set -uo pipefail

SUMMARY="${1:-qa-report/summary.json}"
RESULTS="${2:-$(dirname "$SUMMARY")/results.json}"
STEP_SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"

tmp=""
cleanup() { if [ -n "$tmp" ]; then rm -rf "$tmp"; fi; }
trap cleanup EXIT

fail() {
  echo "::warning title=Profihost upload failed::$1"
  echo "- Profihost upload **FAILED**: $1" >> "$STEP_SUMMARY"
  exit 1
}

if [ -z "${PROFIHOST_HOST:-}" ]; then
  echo "::notice title=Profihost upload skipped::PROFIHOST_HOST is not set — add the PROFIHOST_* secrets to upload results for the central QA report."
  echo "- Profihost upload skipped (PROFIHOST_HOST not set)" >> "$STEP_SUMMARY"
  exit 0
fi

missing=""
for v in PROFIHOST_USER PROFIHOST_SSH_KEY PROFIHOST_KNOWN_HOSTS; do
  [ -n "${!v:-}" ] || missing="$missing $v"
done
[ -z "$missing" ] || fail "PROFIHOST_HOST is set but these secrets are missing:$missing"
[ -f "$SUMMARY" ] || fail "$SUMMARY not found (the summary step did not run)"
command -v sftp >/dev/null 2>&1 || fail "sftp is not installed"

# project / environment / timestamp / status line from summary.json (node is always there: the suite needs it)
if ! fields="$(node -e '
  const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const ok = (v) => typeof v === "string" && /^[a-z0-9-]+$/.test(v);
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(s.timestamp || "");
  if (!ok(s.project) || !ok(s.environment) || !m) process.exit(2);
  console.log([s.project, s.environment, m[1], m[2] + m[3] + m[4],
    `${s.status} (${s.passed} passed, ${s.failed} failed, ${s.flaky} flaky, ${s.skipped} skipped)`].join("\t"));
' "$SUMMARY" 2>/dev/null)"; then
  fail "$SUMMARY has no valid project / environment / timestamp"
fi
IFS=$'\t' read -r project environment day time status_line <<< "$fields"

dest="qa-reports/$project/$environment/$day/$time"
port="${PROFIHOST_PORT:-22}"

tmp="$(mktemp -d)"
umask 077
printf '%s\n' "$PROFIHOST_SSH_KEY" > "$tmp/key"
chmod 600 "$tmp/key"
printf '%s\n' "$PROFIHOST_KNOWN_HOSTS" > "$tmp/known_hosts"

{
  # one level at a time; "-" ignores "already exists"
  echo "-mkdir qa-reports"
  echo "-mkdir qa-reports/$project"
  echo "-mkdir qa-reports/$project/$environment"
  echo "-mkdir qa-reports/$project/$environment/$day"
  echo "-mkdir $dest"
  echo "put \"$SUMMARY\" $dest/summary.json"
  # no results.json (run crashed / timed out) → summary.json alone still carries the FAILED status
  if [ -f "$RESULTS" ]; then echo "put \"$RESULTS\" $dest/results.json"; fi
} > "$tmp/batch"

sftp -b "$tmp/batch" -P "$port" -i "$tmp/key" \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$tmp/known_hosts" \
  -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=30 \
  "$PROFIHOST_USER@$PROFIHOST_HOST"
rc=$?
[ "$rc" -eq 0 ] || fail "sftp exited with code $rc — $status_line not delivered to $dest"

[ -f "$RESULTS" ] || echo "::warning title=results.json missing::Only summary.json was uploaded to $dest"
echo "Uploaded to Profihost: $dest"
echo "- Profihost: $status_line → \`$dest/\`" >> "$STEP_SUMMARY"
