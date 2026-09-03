# Releasing `pi-post`

Releases are **tag-driven and automated**: pushing a `vX.Y.Z` tag triggers
[`.github/workflows/release.yml`](../.github/workflows/release.yml), which runs
the gate, publishes to npm via **OIDC trusted publishing** (no token, no OTP,
with provenance), and cuts the GitHub release.

## One-time setup (npmjs.com)

The package must exist on the registry first, so **v0.1.0 is published
manually** from a clean checkout with the gate green:

```bash
git checkout v0.1.0   # or the release commit
npm ci && npm run check
npm publish           # npm login / OTP applies here, once
```

Then configure the trusted publisher once, on the package:

- npmjs.com → **pi-post** → Settings → **Trusted Publisher** → GitHub Actions
- Organization or user: `vieko` · Repository: `pi-post` · Workflow filename:
  `release.yml` · Environment: *(leave blank)*

This is what lets the workflow publish without a stored token or a 2FA prompt.

## Cut a release

1. **Bump the version**, commit, and push `main`:

   ```bash
   npm version <patch|minor|major> --no-git-tag-version
   npm run check        # be green locally first
   git commit -am "chore: vX.Y.Z" && git push
   ```

2. **Tag the release commit and push the tag** -- that is the whole trigger:

   ```bash
   git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z
   ```

   The tag version must equal `package.json`'s (the workflow enforces this).
   Watch it land: `gh run watch`.

### Known local-only failure

On some managed macOS hosts (seen on `phyrexia`, 2026-09-03), `npm run check`
fails one test locally while CI is green:

```
✖ an oversize body is refused with a nonzero exit
   actual: null, expected: 1
```

`status: null` means the child was `SIGKILL`ed, not that the cap check
misbehaved: any `node bin/pi-post.mjs ...` invocation carrying a ~33 KB
argv element is killed before the script runs, while plain `node` with
the same argument is fine. That points at endpoint security on the
host, not at pi-post. Confirm by checking the release workflow of the
previous tag passed with the test unchanged, then proceed; the tag's
CI gate is the one that counts. Do not weaken the test to make the
local run pass.

## Installing a fresh release locally

If npm's `min-release-age` cooldown is configured, a just-published version is
uninstallable for its duration. Bypass for a trusted install of your own
release:

```bash
NPM_CONFIG_MIN_RELEASE_AGE=0 pi update --extensions
```

## Manual fallback

If trusted publishing is unavailable: `npm publish` from a clean checkout of
the tag, with the gate green (`npm ci && npm run check`).

## Wire format discipline

`src/message.ts` + `src/address.ts` and `bin/pi-post.mjs` implement the same
wire contract independently (the CLI must run under bare node). Any release
that touches the message schema or address derivation must change **both**,
keep `test/cli.test.ts` green, and bump the message `v` if the change is not
backward compatible.
