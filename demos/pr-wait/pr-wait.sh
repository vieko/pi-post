#!/usr/bin/env bash
# pr-wait.sh -- wait for a PR's checks to settle, then message a pi session.
#
# The smallest useful process sender: a shell script that blocks on
# something outside pi (here, GitHub checks) and deposits the result with
# `pi-post send` when it is done. Run it from a pi session's bash tool with
# `--detach` and the session can end its turn; wake-on-idle turns the
# deposit into the session's next turn.
#
#   pr-wait.sh <pr> [--repo owner/name] [--to <target>] [--detach]
#
#   <pr>        PR number, URL, or branch (anything `gh pr view` accepts)
#   --repo      repo when not running inside a clone
#   --to        pi-post target (default: $PI_SESSION_ADDRESS, exported by
#               the pi-post extension into every bash tool)
#   --detach    re-exec in the background and return immediately
#
# Requires gh (authenticated) and pi-post on PATH or at
# ~/.pi/agent/post/bin/pi-post. The richer team version (review-bot
# verdicts, unresolved threads, --for conditions) lives in vercel/gtm
# under scripts/gh/; this one is deliberately small.

set -euo pipefail

pr=""; repo=(); to="${PI_SESSION_ADDRESS:-}"; detach=0; orig=("$@")
while [[ $# -gt 0 ]]; do
    case "$1" in
        --repo)   repo=(--repo "${2:?}"); shift 2 ;;
        --to)     to="${2:?}"; shift 2 ;;
        --detach) detach=1; shift ;;
        -h|--help) sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *)        pr="$1"; shift ;;
    esac
done
[[ -n "$pr" ]] || { echo "usage: pr-wait.sh <pr> [--repo owner/name] [--to target] [--detach]" >&2; exit 2; }
[[ -n "$to" ]] || { echo "error: no target -- run inside a pi session or pass --to" >&2; exit 2; }

pipost=$(command -v pi-post || true)
[[ -n "$pipost" ]] || pipost="$HOME/.pi/agent/post/bin/pi-post"
[[ -x "$pipost" ]] || { echo "error: pi-post CLI not found" >&2; exit 2; }

if [[ $detach -eq 1 ]]; then
    args=(); for a in "${orig[@]}"; do [[ "$a" == "--detach" ]] || args+=("$a"); done
    log="${TMPDIR:-/tmp}/pr-wait-$(printf '%s' "$pr" | tr -c 'A-Za-z0-9._-' '_').log"
    nohup "$0" "${args[@]}" >"$log" 2>&1 </dev/null &
    echo "pr-wait detached (pid $!), will message $to when #$pr settles; log: $log"
    exit 0
fi

number=$(gh pr view "$pr" "${repo[@]}" --json number --jq .number)

# `gh pr checks --watch` blocks until every check completes. Exit 0 = all
# passed, 1 = at least one failed, 8 = still pending (only without --watch,
# or if the watch was cut short). Capture the table either way so the
# message shows the failing rows, not just a verdict.
set +e
checks=$(gh pr checks "$number" "${repo[@]}" --watch --interval 20 2>&1)
rc=$?
set -e
case $rc in
    0) verdict="checks green" ;;
    1) verdict="checks FAILED" ;;
    8) verdict="checks still pending (watch interrupted)" ;;
    *) verdict="pr-wait error (gh exit $rc)" ;;
esac

summary=$(gh pr view "$number" "${repo[@]}" \
    --json title,url,mergeStateStatus,reviewDecision \
    --jq '"\(.title)\n\(.url)\nmerge: \(.mergeStateStatus)  review: \(.reviewDecision // "NONE")"')

printf '#%s: %s\n%s\n\n%s\n' "$number" "$verdict" "$summary" "$(grep -vE '^\S+\s+pass' <<<"$checks" | head -20)" \
    | "$pipost" send --to "$to" --from "pr-wait:#$number" --reply-to none

echo "#$number: $verdict -- messaged $to"
[[ $rc -eq 0 ]]
