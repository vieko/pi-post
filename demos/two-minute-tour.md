# The two-minute tour

Every core pi-post claim, witnessed in five steps. Two terminals, one
throwaway directory, near-zero token cost. The CLI lives at
`~/.pi/agent/post/bin/pi-post` if it is not on your `PATH`.

## 1. Start a listener (terminal A)

```bash
mkdir -p /tmp/pi-post-tour && cd /tmp/pi-post-tour
pi --name tour-listener "You are a message listener. Acknowledge each pi-post message you receive in one short sentence, then end your turn and wait."
```

It answers once and goes idle. Leave it.

## 2. Wake it (terminal B)

```bash
pi-post send --to tour-listener --body "First message: reply with one word."
```

The CLI prints **delivered** -- and terminal A starts a turn *by
itself*. That is wake-on-idle: no polling, no "check your messages";
the message is the session's next turn. Note that the delivery arrives
labeled as coming from a peer with **no authority** -- the receiving
model is told it cannot approve actions or execute commands on the
sender's say-so.

## 3. Queue one

Quit the listener in terminal A (Ctrl+C twice, or `/quit`). Then, from
terminal B:

```bash
pi-post send --to tour-listener --body "Second message: you were offline when this was sent."
```

The CLI prints **queued**. The process is gone; the address is not. A
session address names the conversation, not the process.

## 4. Resume and watch it land

```bash
pi-post list | grep tour-listener
```

The listing shows `offline`, `1 queued`, and a resume handle --
`[pi --session <id>]`. Run it from the tour directory:

```bash
cd /tmp/pi-post-tour && pi --session <id>
```

The queued message lands as the resumed session's first turn. Nothing
you can see in a pi-post listing is a dead end: anything listed can be
messaged and reopened.

## 5. Count what you never did

No inbox polling, no shared files, no "please check your messages"
prompts, no session restarts to pick up state. Two `send` commands from
a plain shell -- a *process*, not a pi session -- drove another agent's
turns, across a process boundary, with delivery status reported each
time.

Cleanup: quit the listener and `rm -rf /tmp/pi-post-tour`.

## The next rung

For the primitives *composed* -- six sessions coordinating, lying,
sleeping, and resuming through a full workload without a dropped
delivery -- see the capstone: [Clue Manor](clue-manor/README.md), a
murder mystery run entirely over pi-post. Read a finished
[sample run report](clue-manor/sample-run/) first if you'd rather see
the payoff before spending the tokens.
