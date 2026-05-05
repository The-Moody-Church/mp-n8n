# Releasing

This package is published to npm as a community node and follows a two-channel release model.

## Channels

| Channel | npm dist-tag | Version shape | Audience |
|---|---|---|---|
| Stable | `latest` (default) | `0.2.0`, `1.0.0` | What `npm install @moody-church/n8n-nodes-ministry-platform` and the n8n UI install by default |
| Pre-release | `beta` | `0.2.0-beta.1`, `0.2.0-rc.0` | Opt-in testers — `npm install @moody-church/n8n-nodes-ministry-platform@beta` or pin `@0.2.0-beta.1` in the n8n UI |

PR branches are **not** published to npm. To validate an unmerged branch:

- `docker cp dist/. <n8n-container>:/home/node/.n8n/nodes/node_modules/@moody-church/n8n-nodes-ministry-platform/dist/` and restart n8n (the loop used during local development), or
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
9. Runs `npm publish --tag <channel> --access public --provenance`. Authenticates to npm via OIDC (Trusted Publishing) — no `NPM_TOKEN` involved.

## Auto-version rules (when `version` is blank)

- Channel `beta`:
  - From `0.2.0` → `0.2.0-beta.0`
  - From `0.2.0-beta.3` → `0.2.0-beta.4`
- Channel `latest`:
  - From `0.2.0-beta.5` → `0.2.0` (strip prerelease)
  - From `0.2.0` → workflow refuses; specify the next stable version explicitly

For stable releases, **always pass an explicit `version`** — auto-increment for `latest` is intentionally limited to "promote the current beta line" because picking the next stable is a judgment call (patch vs minor vs major).

## Required setup (one-time)

This workflow uses **npm Trusted Publishing** — GitHub Actions authenticates to npm via short-lived OIDC tokens, so no long-lived `NPM_TOKEN` secret is stored anywhere. As a side benefit, every published version carries a verified [provenance attestation](https://docs.npmjs.com/generating-provenance-statements) that npm displays on the package page.

### 1. Create the npm org

If it doesn't already exist, create the `moody-church` org at https://www.npmjs.com/org/create. The package name `@moody-church/n8n-nodes-ministry-platform` lives under that scope. Add yourself (and any other maintainers) to the org.

### 2. Configure Trusted Publishing on npm

Trusted Publishing has to be configured *per package*. There are two paths depending on whether the package already exists on npm:

**Path A — package not yet published (recommended for our case):**

1. Go to https://www.npmjs.com/package/@moody-church/n8n-nodes-ministry-platform/access (the URL works even if the package doesn't exist yet — npm will show a "pending publisher" form).
2. Under **Trusted Publisher**, choose **GitHub Actions** and fill in:
   - Organization or user: `The-Moody-Church`
   - Repository: `mp-n8n`
   - Workflow filename: `release.yml`
   - Environment name: *(leave blank)*
3. Save. The first publish from this workflow will create the package and bind the trusted publisher.

**Path B — package already published with a token:**

1. Open the package on npm → **Settings** → **Publishing access**.
2. Add a Trusted Publisher with the same fields as above.
3. Subsequent publishes from the workflow stop needing `NPM_TOKEN`.

> **Don't create an npm Automation token unless you also want a fallback.** The 2FA-bypass warning npm shows when you create one is real. If you have an old `NPM_TOKEN` secret in the repo, delete it after Trusted Publishing is configured.

### 3. Branch protection on `main`

The workflow pushes the version-bump commit and the tag directly to `main`. If you require PR review for all pushes, either:

- exempt `github-actions[bot]` (or admins) from the protection rule, or
- adopt a release-PR pattern instead (workflow opens a PR with the version bump; tag-pushed workflow publishes after merge). Not implemented today.

### 4. (Optional) Restrict the workflow to admins

`workflow_dispatch` is gated by repo write access by default. If you want to lock it down further (so anyone with write can't trigger a publish), put it behind a [GitHub Actions environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) with required reviewers. Note that if you do this, you must list the same environment name when configuring Trusted Publishing on npm.

## Promoting a beta to stable

Sequence:

1. Cut the beta(s): `channel=beta`, version e.g. `0.2.0-beta.0`, `0.2.0-beta.1`, …
2. Once happy, run the workflow again with `channel=latest`, `version=0.2.0`. The workflow strips the prerelease and publishes to `latest`.
3. Optional: move the `beta` dist-tag forward later as the next development line begins.

## Moving a dist-tag without publishing

If you need to point `beta` at an already-published version (e.g. you mistakenly tagged a build):

```sh
npm dist-tag add @moody-church/n8n-nodes-ministry-platform@0.2.0-beta.1 beta
```

This rewrites only the pointer — no new version is published.

## Unpublishing

npm allows unpublish only within 72 hours and only when no other package depends on yours. Treat every publish as permanent. If you publish a broken version, the recovery is **publish a fix as a new version** and (if the broken one was on `latest`) move the dist-tag back to the previous good version:

```sh
npm dist-tag add @moody-church/n8n-nodes-ministry-platform@<last-good> latest
```
