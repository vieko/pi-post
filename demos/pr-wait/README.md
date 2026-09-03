# pr-wait: a blocking wait becomes a turn boundary

The everyday shape of a process sender. An agent opens a PR and now has
to wait for CI. Without pi-post the wait looks like this in the session
log, over and over:

```bash
for i in 1 2 3 4 5 6 7 8 9 10; do sleep 60; gh pr checks 3146 | grep -c pending; done
```

Ten minutes parked inside one bash tool call. The model cannot do
anything else, the user cannot steer without interrupting, and every
poll iteration lands in context. Across two weeks of one repo's sessions
that pattern appeared 75 times, about three hours of requested `sleep`.

With pi-post the wait leaves the turn. The script blocks in the
background, and when it finishes it deposits the result with `pi-post
send`. If the session is idle, wake-on-idle makes the deposit its next
turn; if it is mid-task, the message arrives as a steer between tool
calls. Either way the agent ends its turn after "PR open, waiting on
checks" and picks up exactly where the result lands.

## Run it

From a pi session, in a repo with an open PR (the session's own
address is exported as `PI_SESSION_ADDRESS` into every bash tool, so
no target is needed):

```
> Open the PR, then run demos/pr-wait/pr-wait.sh <number> --detach and end your turn.
```

The tool output is one line:

```
pr-wait detached (pid 41213), will message s-9f3c… when #3146 settles; log: /tmp/pr-wait-3146.log
```

The agent replies, the session goes idle. Some minutes later it starts
a turn by itself, with this as the incoming message:

```
#3146: checks green
fix(lead-agent): guard null contact on enrichment
https://github.com/org/repo/pull/3146
merge: CLEAN  review: APPROVED

All checks were successful
```

Failing checks arrive the same way, with the failing rows in the body,
so the next turn is "read the failure", not "poll again".

Without a pi session, `--to` takes any pi-post target (a session name,
an `s-…` address, or a directory), which is how a CI job or a Claude Code
hook would use the same script.

## What it witnesses

- **Process senders.** A plain shell script is a first-class sender; the
  CLI is the whole integration surface.
- **Wake-on-idle.** The result starts a turn. Nothing polls a mailbox.
- **The boundary label.** The message arrives marked as a peer with no
  authority. "checks green" is a report, not a merge approval; the
  receiving agent still runs whatever its repo's merge rules are.
- **Detached survives the tool.** pi spawns bash tools detached, so a
  `nohup … &` child outlives the call that started it. If the session
  has since closed, the deposit queues and lands on resume.

## The team version

This script is deliberately minimal: `gh pr checks --watch` plus a
send. The version that grew out of the session data it cites lives in
[vercel/gtm `scripts/gh/`](https://github.com/vercel/gtm/tree/main/scripts/gh)
(private): `pr-status.sh` folds merge state, review-bot verdict on the
current head, and unresolved review threads into one screen, and
`pr-wait.sh` waits on combinations of those (`--for checks,review`,
`--for mergeable`, `--for merged`) with `--then <cmd>` as a generic hook
beside `--notify`. Same pi-post call at the end.
