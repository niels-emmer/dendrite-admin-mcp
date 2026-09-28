# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An MCP server (TypeScript, `@modelcontextprotocol/sdk`) that wraps
[Dendrite](https://github.com/matrix-org/dendrite)'s admin API — Dendrite is
a Matrix homeserver implementation written in Go; this repo is not part of
Dendrite itself, it's a separate client that talks to a running Dendrite
instance over HTTP. Each MCP tool corresponds to one Dendrite admin endpoint.

## Commands

```bash
npm ci              # install deps (lockfile is committed)
npm run build        # tsc -> dist/
npm run dev           # tsx watch src/index.ts (hot-reload dev server)
npm start              # run the built server (node dist/index.js)
npm run typecheck       # tsc --noEmit (src + tests, via tsconfig.test.json)
npm test                # node:test suite via tsx --test (test/*.test.ts)
npm run setup           # interactive .env setup + install/build/test + agent registration snippets
npm run inspector        # launch @modelcontextprotocol/inspector against the built server (stdio only)

docker compose up -d --build   # build + run the HTTP-transport server, restart: unless-stopped
```

Tests live in `test/*.test.ts` (node:test + node:assert, run through `tsx --test` —
no test framework dependency). `tsconfig.test.json` extends the base config with
`noEmit` so tests are typechecked but never emitted into `dist/`.

Dependencies are pinned to exact versions and `package-lock.json` is committed
(the repo's `.npmrc` sets `package-lock=true`, overriding the machine-global
`package-lock=false`). The Dockerfile uses `npm ci` in both stages.

`scripts/setup.mjs` (`npm run setup`) is the agent-facing install path: it
prompts for (or accepts via flags) `DENDRITE_BASE_URL` and
`DENDRITE_ADMIN_TOKEN`, writes `.env`, installs, builds, tests, and prints the
MCP registration snippet for the user's agent. Keep the README quickstart and
the per-agent snippets in sync with it.

Required env vars (see `.env.example`): `DENDRITE_BASE_URL`,
`DENDRITE_ADMIN_TOKEN`. `DENDRITE_REGISTRATION_SHARED_SECRET` is optional,
needed only by `register_user`. `loadConfig()` in `src/config.ts` throws
immediately at startup if a required var is missing — the server refuses to
come up misconfigured rather than failing on first tool call.

`MCP_TRANSPORT` (`stdio` default, or `http`) picks the transport in
`src/index.ts`. In `http` mode, `MCP_AUTH_TOKEN` is also required —
`src/transports/http.ts` throws at startup without it, same fail-fast
pattern as `loadConfig()`.

## Architecture

- `src/index.ts` — entry point. Builds the `Config` and one `DendriteClient`,
  then dispatches to `src/transports/stdio.ts` or `src/transports/http.ts`
  based on `MCP_TRANSPORT`.
- `src/transports/stdio.ts` — builds one `McpServer`, registers tools,
  connects a `StdioServerTransport`. For a client that spawns this process
  directly.
- `src/transports/http.ts` — stateless Streamable HTTP transport (a fresh
  `McpServer` + `StreamableHTTPServerTransport` per request via
  `sessionIdGenerator: undefined`, per the SDK's stateless example) served
  over Express, gated by a bearer-token `requireAuth` middleware on `/mcp`.
  `/healthz` is unauthenticated, for the Docker healthcheck. This is what
  makes the server reachable over LAN/Tailscale rather than only as a
  locally-spawned subprocess.
- `src/config.ts` — reads and validates env vars into a `Config` object.
  Nothing else in the codebase reads `process.env` directly.
- `src/dendriteClient.ts` — the only place that calls `fetch` against the
  Dendrite homeserver. `DendriteClient.request(method, path, { body, auth })`
  attaches the admin bearer token by default (`auth: true`); callers pass
  `auth: false` for the one endpoint that must be unauthenticated (the
  register-nonce step — see below). Non-2xx responses throw
  `DendriteApiError` with the parsed response body attached.
- `src/tools/*.ts` — one file per group of related admin endpoints (`rooms`,
  `users`, `notices`, `search`), each exporting a `registerXTools(server,
  client, config?)` function. `src/tools/index.ts` calls all of them from
  `registerAllTools`. To add a new admin endpoint: add a `server.registerTool`
  call in the relevant file (or a new file + registration call if it's a new
  category), following the existing `{ title, description, inputSchema }` +
  async handler shape.
- `src/tools/helpers.ts` — `run(fn)` wraps a tool handler body, catching
  `DendriteApiError` and other errors and turning them into an MCP
  `isError: true` content result instead of throwing. Every tool handler
  should return `run(() => ...)` rather than handling errors itself.

## Dendrite admin API notes

The full admin surface this server wraps, for reference (source: Dendrite's
`clientapi/routing/routing.go` and the published admin API docs):

- **Dendrite-native** (`/_dendrite/admin/...`, bearer admin token):
  `evacuateRoom/{roomID}`, `evacuateUser/{userID}`, `purgeRoom/{roomID}`,
  `resetPassword/{userID}`, `downloadState/{serverName}/{roomID}`,
  `fulltext/reindex`, `refreshDevices/{userID}`, and the
  `registrationTokens` CRUD routes.
- **Synapse-compatible** (`/_synapse/admin/...`): `v1/register` (shared-secret
  registration, *not* bearer-token authenticated) and
  `v1/send_server_notice` (bearer admin token).
- **Matrix client-server** (`/_matrix/client/v3/admin/whois/{userId}`,
  bearer admin token).

`register_user` is the one tool with a two-step flow: `GET
/_synapse/admin/v1/register` (unauthenticated) returns a nonce, then the
caller HMAC-SHA1s `nonce\0username\0password\0("admin"|"notadmin")` with the
shared secret and POSTs the result back as `mac`. This is why
`registerUserTools` needs `config` (for the shared secret) in addition to
`client`, unlike the other `registerXTools` functions.

## Working in this repo

- `evacuate_room`, `purge_room`, and `evacuate_user` are destructive/disruptive
  on a real homeserver (`purge_room` is explicitly irreversible). When adding
  similar tools, keep descriptions explicit about blast radius — that
  description text is what an agent sees before deciding to call the tool.
- Tool input schemas are plain `ZodRawShape` objects (e.g. `{ roomId:
  z.string() }`), not `z.object({...})` — that's what
  `McpServer.registerTool`'s `inputSchema` field expects.
- Keep `src/dendriteClient.ts` the single chokepoint for HTTP calls; don't
  add `fetch` calls inside `src/tools/*`.
