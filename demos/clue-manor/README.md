# Clue Manor — a pi-post demo

A murder-mystery game that exercises the full pi-post contract with live
pi sessions: one **Ghost** (the session you talk to — victim, game
master, and message hub) and four to six **suspects** (autonomous
sessions playing the classic cast), one of whom is the murderer. The
suspects interrogate the Ghost over `send_message`; the Ghost answers
with clues, never the full picture. The game runs itself, start to
finish, with zero pauses — you watch the traffic and interject only if
you want to.

What it demonstrates, concretely:

- **Wake-on-idle delivery** — every clue the Ghost sends starts the idle
  suspect's next turn; no polling, no "check your messages".
- **Named sessions** — each suspect starts with `pi --name`
  (`miss-scarlett`, `colonel-mustard`, …), so `list_sessions` and
  delivery headers stay legible instead of showing N indistinguishable
  `<dir>-<addr4>` defaults from one run directory.
- **Queued delivery** — one suspect retires mid-game and their session
  is closed; a clue sent to them reports `queued` and lands as their
  first turn on resume. The address names the conversation, not the
  process.
- **Process senders** — dawn breaks via `pi-post send` from a detached
  shell timer, not from any pi session, and gates the endgame.
- **Peer-to-peer messaging** — whisper hour: each suspect sends one
  direct message to a fellow guest, resolved by session name, no hub.
- **The authority boundary** — suspects lie, frame each other, and
  demand things all night; every delivery arrives labeled as carrying no
  authority, and the game only works because the channel is untrusted.

Every message carries a scannable envelope first line
(`[CLUE SCARLETT Q]`, `[CLUE GHOST DAWN]`, …), so tmux panes, `/inbox`
previews, and the event log read at a glance.

## Run it

Requirements: tmux, pi with pi-post installed, node (for the report
renderer), and a model binding for the suspect sessions.

1. Start a pi session anywhere (this repo is fine) and say:

   > Read demos/clue-manor/ghost-brief.md and run the game.

2. The Ghost runs everything itself: summoning via `summon.sh`, the
   clue rounds, whisper hour, the retirement/resume scene, the dawn
   timer, the ruling (mechanical: first fully-correct triple wins), the
   report, and its own window cleanup. If your provider needs explicit
   binding, set it before you start:

   ```bash
   export PI_ARGS='--provider vercel-ai-gateway --model anthropic/claude-haiku-4.5:low'
   ```

   Cheap, fast models make good suspects. Want a hand on the wheel?
   Say so in the kickoff prompt ("I'll rule on the verdict", "pause
   before each clue", "I'm playing blind") — the Ghost honors it. Any
   message you send mid-run overrides the script.

3. The game ends with `report.html` in the run directory — rendered
   deterministically from `events.jsonl` by `render-report.mjs`
   (self-contained HTML, no external assets, no JS). Ask the Ghost for
   a Next.js viewer over the same event log if you want the deluxe
   version.

## The cast

Default is the four-suspect classic: Miss Scarlett, Colonel Mustard,
Mrs. Peacock, Professor Plum. `summon.sh -6` completes the original
board-game six with Reverend Green (a nervy cleric who witnessed the
7:45 PM study theft) and Mrs. White (the retired housekeeper who knows
the house — and famously retires early, making her the queued-delivery
scene's natural victim). Six suspects roughly doubles the message
traffic; budget accordingly.

## Spoiler discipline

`briefs/plum.md` names the murderer. To play detective alongside the
suspects, don't read the briefs — tell the Ghost you're playing blind
and it will keep the solution from you until an accusation forces the
reveal. For a genuinely unknown mystery, ask the Ghost for
fresh-scenario mode: it authors a new solution and witness web, writes
new briefs, and summons with `summon.sh -b <dir>`.

## Files

| File | Purpose |
| --- | --- |
| `ghost-brief.md` | Game-master brief for the session you talk to: the solution, the phase script, the event-log schema, the three human checkpoints. |
| `briefs/*.md` | One brief per suspect; `{{GHOST_ADDRESS}}` and `{{CAST}}` hydrated by the summon script. |
| `summon.sh` | Spawns suspects in named tmux windows with `pi --name`; writes `manifest.tsv` per run. `-6` for the full cast, `-b` for fresh-scenario briefs. |
| `render-report.mjs` | Deterministic report renderer: `events.jsonl` in, self-contained `report.html` out. |
| `runs/` | Per-run artifacts: hydrated briefs, `manifest.tsv`, `events.jsonl`, `report.html`. Gitignored. |
