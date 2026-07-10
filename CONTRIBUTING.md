# Contributing to ProxView

Thanks for your interest in improving ProxView! It's a free, self-hosted, **read-only**
monitoring dashboard for Proxmox VE + PBS, and contributions of all sizes are welcome —
bug reports, docs, and code.

## Ground rules

- **ProxView only reads.** It talks to Proxmox/PBS with least-privilege *audit* tokens and
  a read-only SSH key. Please don't add features that start/stop/mutate guests or nodes —
  that's out of scope for a viewer, and it keeps the security story simple.
- Keep the core stack **localhost-only** by default. Anything that exposes it (tunnels,
  public URLs) must be explicit and opt-in.
- Store secrets **encrypted at rest** (see `backend/src/crypto/secretbox.ts`) — never log
  or serialize tokens, SSH keys, or auth cookies.

## Dev setup

Requires Node 22+ and npm.

```bash
npm install
npm run dev        # backend (Fastify) on :8080, frontend (Vite) on :5173 with an /api proxy
```

Explore the full UI without a real cluster using synthetic data:

```bash
DEMO=1 npm run dev
```

## Project layout

| Path | What it is |
|------|------------|
| `backend/` | Fastify + TypeScript API, pollers, SQLite, SSE. ESM (`NodeNext`) — **use `.js` import extensions**. |
| `frontend/` | React 19 + Vite + Zustand. Dark, dense monitoring UI (uPlot charts). |
| `docker/` | Multi-stage image build. |
| `docs/` | Screenshots and supporting docs. |

## Before you open a PR

Please make sure the checks that CI runs pass locally:

```bash
npm run typecheck      # tsc across both workspaces — must be clean
npm run build          # frontend + backend production builds must succeed
```

- **Match the surrounding code** — naming, comment density, and idioms. No new formatter
  or lint config in a feature PR.
- Keep changes focused; one logical change per PR.
- If you touch a data provider (PVE/PBS/sensors), note how you verified it against a real
  or demo instance in the PR description.
- Write clear commit messages (imperative mood, e.g. "Add PBS namespace discovery").

## Reporting bugs

Open an issue with: what you expected, what happened, ProxView version, how you deploy
(Docker/compose), and relevant **redacted** logs (`docker compose logs app`). Never paste
tokens, SSH keys, or cookies.

## Security

Found a vulnerability? Please **do not** open a public issue — email the maintainer
(see the repository profile) so it can be fixed before disclosure.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
