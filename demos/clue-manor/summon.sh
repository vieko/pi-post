#!/usr/bin/env bash
# summon.sh -- spawn the Clue Manor suspects as named pi sessions.
#
# Run from the Ghost session's bash tool so PI_SESSION_ADDRESS is
# inherited (pi-post exports it at session start); it becomes the
# {{GHOST_ADDRESS}} every suspect writes to. Or pass it explicitly:
#
#   summon.sh [-a s-...] [-6] [-b briefs_dir] [-n]
#
#   -a addr   Ghost address (default: $PI_SESSION_ADDRESS)
#   -6        full classic cast: adds Reverend Green and Mrs. White
#   -b dir    custom briefs dir (fresh-scenario mode: the Ghost authors
#             its own briefs; files must be named <role>.md)
#   -n        dry run: print what would be executed
#
# Model/provider binding for the suspects goes through PI_ARGS, e.g.:
#   export PI_ARGS='--provider vercel-ai-gateway --model anthropic/claude-haiku-4.5:low'
#
# Each suspect gets its own tmux window (clue-<role>) and its own display
# name via `pi --name` -- so list_sessions and message headers read
# miss-scarlett, not the default <dir>-<addr4> of N indistinguishable
# sessions in one directory. A manifest (manifest.tsv: role, session
# name, window, pane) is written into the run dir for the Ghost's
# retirement/resume mechanics and for the report renderer.

set -euo pipefail

demo_dir="$(CDPATH= cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ghost_addr="${PI_SESSION_ADDRESS:-}"
briefs_dir="$demo_dir/briefs"
dry_run=0
full_cast=0
while getopts "a:b:6n" opt; do
    case "$opt" in
        a) ghost_addr="$OPTARG" ;;
        b) briefs_dir="$OPTARG" ;;
        6) full_cast=1 ;;
        n) dry_run=1 ;;
        *) exit 2 ;;
    esac
done

[[ -n "$ghost_addr" ]] || {
    echo "error: no ghost address -- run from a pi session's bash tool or pass -a s-..." >&2
    exit 1
}
[[ -n "${TMUX:-}" ]] || { echo "error: requires an active tmux session" >&2; exit 1; }
[[ -d "$briefs_dir" ]] || { echo "error: briefs dir not found: $briefs_dir" >&2; exit 1; }

roles=(scarlett mustard peacock plum)
[[ $full_cast -eq 1 ]] && roles+=(green white)

session_name() {
    case "$1" in
        scarlett) echo "miss-scarlett" ;;
        mustard)  echo "colonel-mustard" ;;
        peacock)  echo "mrs-peacock" ;;
        plum)     echo "professor-plum" ;;
        green)    echo "reverend-green" ;;
        white)    echo "mrs-white" ;;
    esac
}

cast_list=""
for r in "${roles[@]}"; do
    cast_list+="${cast_list:+, }$(session_name "$r")"
done

run_dir="$demo_dir/runs/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$run_dir/briefs"

for r in "${roles[@]}"; do
    src="$briefs_dir/$r.md"
    [[ -r "$src" ]] || { echo "error: brief missing: $src" >&2; exit 1; }
    sed -e "s/{{GHOST_ADDRESS}}/$ghost_addr/g" \
        -e "s/{{CAST}}/$cast_list/g" \
        "$src" > "$run_dir/briefs/$r.md"
done

echo "run dir: $run_dir"
echo "ghost:   $ghost_addr"
echo "cast:    $cast_list"
touch "$run_dir/events.jsonl"
manifest="$run_dir/manifest.tsv"
printf 'role\tname\twindow\tpane\n' > "$manifest"

panes=()
for r in "${roles[@]}"; do
    name="$(session_name "$r")"
    window="clue-$r"
    prompt="Read $run_dir/briefs/$r.md and follow it exactly."
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
    printf '%s\t%s\t%s\t%s\n' "$r" "$name" "$window" "$pane_id" >> "$manifest"
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
echo "manifest: $manifest"
echo "cleanup when the game is over:"
echo "  for w in ${roles[*]/#/clue-}; do tmux kill-window -t \$w; done"
exit $failed
