#!/usr/bin/env bash
# summon.sh -- spawn the four Clue Manor suspects as named pi sessions.
#
# Run from the Ghost session's bash tool so PI_SESSION_ADDRESS is
# inherited (pi-post exports it at session start); it becomes the
# {{GHOST_ADDRESS}} every suspect writes to. Or pass it explicitly:
#
#   summon.sh [-a s-...] [-n]
#
#   -a addr   Ghost address (default: $PI_SESSION_ADDRESS)
#   -n        dry run: print what would be executed
#
# Model/provider binding for the suspects goes through PI_ARGS, e.g.:
#   export PI_ARGS='--provider vercel-ai-gateway --model anthropic/claude-haiku-4.5:low'
#
# Each suspect gets its own tmux window (clue-scarlett, ...) and, most
# importantly for pi-post, its own display name via `pi --name` -- so
# list_sessions and message headers read miss-scarlett, not the default
# <dir>-<addr4> of four indistinguishable sessions in one directory.

set -euo pipefail

demo_dir="$(CDPATH= cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ghost_addr="${PI_SESSION_ADDRESS:-}"
dry_run=0
while getopts "a:n" opt; do
    case "$opt" in
        a) ghost_addr="$OPTARG" ;;
        n) dry_run=1 ;;
        *) exit 2 ;;
    esac
done

[[ -n "$ghost_addr" ]] || {
    echo "error: no ghost address -- run from a pi session's bash tool or pass -a s-..." >&2
    exit 1
}
[[ -n "${TMUX:-}" ]] || { echo "error: requires an active tmux session" >&2; exit 1; }

run_dir="$demo_dir/runs/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$run_dir/briefs"

# Hydrate briefs with the ghost address.
for b in scarlett mustard peacock plum; do
    sed "s/{{GHOST_ADDRESS}}/$ghost_addr/g" "$demo_dir/briefs/$b.md" > "$run_dir/briefs/$b.md"
done

suspects=(
    "scarlett:miss-scarlett"
    "mustard:colonel-mustard"
    "peacock:mrs-peacock"
    "plum:professor-plum"
)

echo "run dir: $run_dir"
echo "ghost:   $ghost_addr"
touch "$run_dir/events.jsonl"

panes=()
for entry in "${suspects[@]}"; do
    brief="${entry%%:*}"
    name="${entry##*:}"
    window="clue-$brief"
    prompt="Read $run_dir/briefs/$brief.md and follow it exactly."
    # shellcheck disable=SC2086  # PI_ARGS is deliberately word-split
    cmd="pi ${PI_ARGS:-} --name \"$name\" \"$prompt\""
    if [[ $dry_run -eq 1 ]]; then
        echo "dry-run: new-window -n $window; send-keys: $cmd"
        continue
    fi
    pane_id="$(tmux new-window -d -P -F '#{pane_id}' -n "$window" -c "$run_dir")"
    sleep 1
    tmux send-keys -t "$pane_id" "$cmd" Enter
    panes+=("$window:$pane_id")
    echo "summoned: $name (window $window, pane $pane_id)"
done

[[ $dry_run -eq 1 ]] && exit 0

# Startup verification: fail loudly here, not silently in a background pane.
sleep 15
failed=0
for entry in "${panes[@]}"; do
    window="${entry%%:*}"
    pane_id="${entry##*:}"
    if tmux capture-pane -t "$pane_id" -p 2>/dev/null | grep -qE "No API key found|Error:"; then
        echo "error: $window reported a startup error -- pane tail:" >&2
        tmux capture-pane -t "$pane_id" -p | grep -vE '^\s*$' | tail -5 >&2
        failed=1
    fi
done
[[ $failed -eq 0 ]] && echo "verified: all suspects clean after 15s"

echo
echo "cleanup when the game is over:"
echo "  for w in clue-scarlett clue-mustard clue-peacock clue-plum; do tmux kill-window -t \$w; done"
exit $failed
