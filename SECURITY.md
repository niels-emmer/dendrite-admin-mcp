# Security Policy

## Reporting a Vulnerability

This project exposes admin-level control of a Matrix homeserver (user
management, room evacuation/purge, password resets). Security issues are taken
seriously.

**Please do not open a public issue for security vulnerabilities.** Instead,
report privately via [GitHub Private Vulnerability Reporting](https://github.com/niels-emmer/dendrite-admin-mcp/security/advisories/new)
(or email the maintainer directly if you have their address).

Please include:

- The affected version(s) / commit(s)
- A description of the vulnerability and its impact
- Steps to reproduce, or a proof of concept
- Any suggested fix, if you have one

You should receive an acknowledgement within 3 business days, and a status
update on the fix timeline after that.

## Scope

In scope:

- The MCP server itself (`src/`): authentication, authorization, input
  handling, secret handling, and the HTTP transport's access controls
- The setup tooling (`scripts/`): `.env` handling and secret hygiene
- Dependency supply chain (pinned versions, lockfile integrity)

Out of scope (report upstream instead):

- Vulnerabilities in [Dendrite](https://github.com/element-hq/dendrite)
  itself — report to the Dendrite project
- Vulnerabilities in the Matrix protocol or other homeservers

## Security-relevant design notes

- The server **fails fast** at startup if `DENDRITE_BASE_URL` or
  `DENDRITE_ADMIN_TOKEN` is missing — it never comes up misconfigured.
- The HTTP transport (`MCP_TRANSPORT=http`) is gated by a bearer token
  (`MCP_AUTH_TOKEN`) compared with a timing-safe equality check; `/healthz` is
  the only unauthenticated endpoint.
- `purge_room`, `evacuate_room`, and `evacuate_user` are destructive by design
  — this is an admin tool. Tool descriptions state the blast radius so agents
  confirm before calling them.
- Secrets live only in the gitignored `.env` (written with mode `0600` by
  `npm run setup`); nothing is hardcoded or committed.