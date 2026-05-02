# Releasing

This package is published to npm as a community node and follows a two-channel release model.

## Channels

| Channel | npm dist-tag | Version shape | Audience |
|---|---|---|---|
| Stable | `latest` (default) | `0.2.0`, `1.0.0` | What `npm install n8n-nodes-ministry-platform` and the n8n UI install by default |
| Pre-release | `beta` | `0.2.0-beta.1`, `0.2.0-rc.0` | Opt-in testers — `npm install n8n-nodes-ministry-platform@beta` or pin `@0.2.0-beta.1` in the n8n UI |

PR branches are **not** published to npm. To validate an unmerged branch:

- `docker cp dist/. <n8n-container>:/home/node/.n8n/nodes/node_modules/n8n-nodes-ministry-platform/dist/` and restart n8n (the loop used during local development), or
- `npm install github:The-Moody-Church/mp-n8n#<branch>` for a one-off install in a sandbox.

## Triggering a release

Releases are cut by running the **Release** workflow at `.github/workflows/release.yml`. The workflow does everything in one shot — version bump, commit, tag push, GitHub release, npm publish — but it only runs when you explicitly trigger it.

### From the GitHub UI

1. Go to **Actions → Release → Run workflow**.
2. Pick a branch (`main` for normal releases).
3. Fill the inputs:
   - **`channel`** — `beta` for prereleases, `latest` for stable.
   - **`version`** — explicit version like `0.2.0-beta.1` or `0.2.0`. Leave blank to auto-increment (see Auto-version rules below).
   - **`dry_run`** — check this to run lint/build/version-resolution without pushing tags or publishing.

### From the command line

```sh
gh workflow run release.yml \
  --ref main \
  -f channel=beta \
  -f version=0.2.0-beta.1
```

Add `-f dry_run=true` for a no-op rehearsal.

## What the workflow does

1. Checks out `main`, installs deps, runs lint and build.
2. Resolves the target version (from input or auto-increment).
3. Validates the version matches the channel (e.g. rejects `0.2.0-beta.1` on `latest`).
4. Verifies the version isn't already published on npm.
5. Bumps `package.json`, commits as `github-actions[bot]` with `[skip ci]`.
6. Tags `v<version>`.
7. Pushes the commit and tag to `main`.
8. Creates a GitHub release with auto-generated notes (marked prerelease for `beta`).
9. Runs `npm publish --tag <channel>`.

## Auto-version rules (when `version` is blank)

- Channel `beta`:
  - From `0.2.0` → `0.2.0-beta.0`
  - From `0.2.0-beta.3` → `0.2.0-beta.4`
- Channel `latest`:
  - From `0.2.0-beta.5` → `0.2.0` (strip prerelease)
  - From `0.2.0` → workflow refuses; specify the next stable version explicitly

For stable releases, **always pass an explicit `version`** — auto-increment for `latest` is intentionally limited to "promote the current beta line" because picking the next stable is a judgment call (patch vs minor vs major).

## Required setup (one-time)

Two repository secrets must exist for the workflow to publish:

- **`NPM_TOKEN`** — an npm Automation token (https://docs.npmjs.com/creating-and-viewing-access-tokens). Create one with **Publish** scope, add it under **Settings → Secrets and variables → Actions** as `NPM_TOKEN`.
- **`GITHUB_TOKEN`** is provided automatically; no setup needed.

Branch protection on `main` must allow `github-actions[bot]` to push directly. If you require PR review for everything, either:
- exempt admins / the bot from the rule, or
- adopt a release-PR pattern instead (the workflow opens a PR with the version bump, you merge, then a tag-pushed workflow publishes). Not implemented today.

## Promoting a beta to stable

Sequence:

1. Cut the beta(s): `channel=beta`, version e.g. `0.2.0-beta.0`, `0.2.0-beta.1`, …
2. Once happy, run the workflow again with `channel=latest`, `version=0.2.0`. The workflow strips the prerelease and publishes to `latest`.
3. Optional: move the `beta` dist-tag forward later as the next development line begins.

## Moving a dist-tag without publishing

If you need to point `beta` at an already-published version (e.g. you mistakenly tagged a build):

```sh
npm dist-tag add n8n-nodes-ministry-platform@0.2.0-beta.1 beta
```

This rewrites only the pointer — no new version is published.

## Unpublishing

npm allows unpublish only within 72 hours and only when no other package depends on yours. Treat every publish as permanent. If you publish a broken version, the recovery is **publish a fix as a new version** and (if the broken one was on `latest`) move the dist-tag back to the previous good version:

```sh
npm dist-tag add n8n-nodes-ministry-platform@<last-good> latest
```
