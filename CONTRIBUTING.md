# Contributing to Blossom POS

## Prerequisites

- **Node.js 24** (see `.nvmrc`)
- A Supabase project. Copy `.env.example` to `.env` and set:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

## Local development

```bash
npm install
npm run dev            # Vite dev server (browser)
npm run electron:dev   # build + run the Electron desktop app
```

## Quality gates (run before opening a PR)

```bash
npm run lint           # oxlint — must be 0 errors
npm run assistant:test # assistant catalog tests — must pass
npm run build          # production build must succeed
```

CI runs all three on every pull request (see `.github/workflows/ci.yml`).

## Branching & commits

- `main` is the release branch. Do work on a feature branch and open a PR into `main`.
- Keep PRs focused; never commit `.env`, build output (`dist/`, `release/`),
  `node_modules/`, or scratch files (images, `schema.sql`, etc.).
- Name release commits `Release X.Y.Z: <short summary>`.

## Database (Supabase)

SQL migrations live in `supabase/migrations/`.

> **Important:** this project's schema is applied **by hand in the Supabase SQL
> Editor**. The remote migration-history table is not populated, so **do not run
> `supabase db push`** — it would try to replay every migration against the live
> database. Apply new migration SQL manually in the SQL Editor.

Edge functions deploy via the CLI:

```bash
npx supabase functions deploy <name> --project-ref <project-ref>
```

## Releasing a new desktop version

1. Bump `"version"` in `package.json`.
2. Verify: `npm run lint && npm run assistant:test && npm run build`.
3. Update `CHANGELOG.md`.
4. Publish the installer (this is the clients' auto-update feed):
   ```powershell
   $env:GH_TOKEN = "<token with write access to floral-os-releases>"
   npm run electron:build   # builds the NSIS installer and publishes to
                            # github.com/<owner>/floral-os-releases
   ```
5. Clients auto-update through electron-updater once `latest.yml` is published.

A suitable token is a GitHub Personal Access Token with **Contents: Read/write**
on the `floral-os-releases` repository (fine-grained), or the classic `repo` scope.
