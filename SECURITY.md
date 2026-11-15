# Security Policy

Blossom POS handles sales, payments, and customer data. Security issues are
taken seriously.

## Reporting a vulnerability

Please report suspected vulnerabilities **privately** to the maintainer — do not
open a public issue.

- Do not disclose the issue publicly until it has been addressed.
- Include clear steps to reproduce and the potential impact.

## Architecture & handling notes

- **Desktop app (Electron):** `contextIsolation` on, `nodeIntegration` off,
  `sandbox` on, `webviewTag` off. The renderer reaches the main process only
  through a narrow `contextBridge` preload, and every privileged IPC channel
  re-checks that the caller is the trusted app window.
- **Data (Supabase / PostgreSQL):** the client ships only the **public anon
  key**; all data access is enforced by Row-Level Security (RLS). The
  `service_role` key must never be shipped to the client.
- **Privileged operations** run in Supabase Edge Functions that verify the
  caller's JWT and role server-side before using elevated access.
- **Secrets** (`.env`) are never committed. See `.env.example` for the required
  variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

## Supported versions

Only the latest released version receives security updates.
