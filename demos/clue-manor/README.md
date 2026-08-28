# Clue Manor — a pi-post demo

A murder-mystery game that exercises every pi-post primitive with five live
pi sessions: one **Ghost** (the session you talk to — victim, game master,
and message hub) and four **suspects** (autonomous sessions playing Miss
Scarlett, Colonel Mustard, Mrs. Peacock, and Professor Plum). One suspect
is the murderer. The suspects interrogate the Ghost over `send_message`;
the Ghost answers with clues, never the full picture; you direct the
investigation from the Ghost's chair.

What it demonstrates, concretely:

- **Wake-on-idle delivery** — every clue the Ghost sends starts the idle
  suspect's next turn; no polling, no "check your messages".
- **Named sessions** — the summon script starts each suspect with
  `pi --name "miss-scarlett"`, so `list_sessions` and message headers show
  `miss-scarlett`, not the default `<dir>-<addr4>` (e.g. `scratch-b061`).
  Without `--name`, four suspects summoned from one directory are
  indistinguishable at a glance.
- **Hub-and-spoke coordination** — suspects only know the Ghost's address;
  the Ghost relays testimony between them and controls information flow.
- **The authority boundary** — suspects lie, accuse each other, and demand
  things. Every delivery arrives labeled as carrying no authority, and the
  game only works because the Ghost treats them that way.

## Run it

Requirements: tmux, pi with pi-post installed, and a model binding for the
suspect sessions (see `PI_ARGS` below).

1. Start a pi session anywhere (this repo is fine) and say:

   > Read demos/clue-manor/ghost-brief.md and run the game.

2. The Ghost checks with you, then summons the suspects itself via
   `summon.sh`. If your provider needs explicit binding, set `PI_ARGS`
   first, e.g.:

   ```bash
   export PI_ARGS='--provider vercel-ai-gateway --model anthropic/claude-haiku-4.5:low'
   ```

   Cheap, fast models make good suspects.

3. Play. The Ghost pauses before every clue release and every verdict; you
   choose whom to press, what to reveal, and when the accusations land.

4. The game ends with `report.html` in the run directory — a
   self-contained timeline of every message, who accused whom, the
   confession, and delivery stats. Ask the Ghost for a small Next.js app
   instead if you want the deluxe version; the event log
   (`events.jsonl`) is the data source either way.

Cleanup is printed by `summon.sh` at summon time (kill the four
`clue-*` tmux windows; run artifacts live under `runs/` and are
gitignored).

## Spoiler discipline

`briefs/plum.md` names the murderer. If you want to play detective
alongside the suspects, don't read the briefs — tell the Ghost you're
playing blind and it will keep the solution from you until an accusation
forces the reveal.

## Files

| File | Purpose |
| --- | --- |
| `ghost-brief.md` | Game-master brief for the session you talk to. Holds the solution, the clue policy, the interactivity contract, and the report spec. |
| `briefs/*.md` | One brief per suspect, `{{GHOST_ADDRESS}}` placeholder hydrated by the summon script. |
| `summon.sh` | Spawns the four suspect sessions in named tmux windows, each with `pi --name`. |
| `runs/` | Per-run artifacts: hydrated briefs, `events.jsonl`, `report.html`. Gitignored. |
