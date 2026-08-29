# dendrite-admin-mcp

An MCP (Model Context Protocol) server that exposes [Dendrite](https://github.com/matrix-org/dendrite)'s
admin API as tools, so an LLM agent can administer a Dendrite Matrix homeserver:
manage users, evacuate/purge rooms, send server notices, manage registration
tokens, and more.

## Setup

```bash
npm install
cp .env.example .env   # fill in DENDRITE_BASE_URL and DENDRITE_ADMIN_TOKEN
npm run build
```

### Configuration

| Env var | Required | Purpose |
|---|---|---|
| `DENDRITE_BASE_URL` | yes | Base URL of the homeserver's client-facing port, e.g. `https://matrix.example.com` |
| `DENDRITE_ADMIN_TOKEN` | yes | Access token of a Dendrite server admin user; sent as a Bearer token to all `/_dendrite/admin` and most `/_synapse/admin` endpoints |
| `DENDRITE_REGISTRATION_SHARED_SECRET` | no | `registration_shared_secret` from `dendrite.yaml`; only needed for the `register_user` tool, which authenticates via HMAC instead of the admin token |

## Transports

This server supports two MCP transports, selected via `MCP_TRANSPORT`:

- **`stdio`** (default) — for a client that spawns this process directly (e.g. a local Claude Code / editor MCP config). No network exposure.
- **`http`** — runs a stateless Streamable HTTP MCP server on `MCP_HTTP_HOST:MCP_HTTP_PORT` (default `0.0.0.0:3939`), for remote clients over LAN/Tailscale. Requires `MCP_AUTH_TOKEN`; every request to `/mcp` must send `Authorization: Bearer <token>`. Generate one with `openssl rand -hex 32`.

## Running

```bash
npm run build && npm start
```

For local development with auto-reload:

```bash
npm run dev
```

To poke at the tools interactively (stdio transport):

```bash
npm run inspector
```

## Running with Docker

```bash
cp .env.example .env   # fill in DENDRITE_BASE_URL, DENDRITE_ADMIN_TOKEN,
                         # set MCP_TRANSPORT=http and MCP_AUTH_TOKEN
docker compose up -d --build
```

This builds the image, starts the container with `restart: unless-stopped`, and publishes port 3939. A `/healthz` endpoint (no auth required) backs the container healthcheck.

## Tools

Full API reference (params, request bodies, curl examples): see [`API.md`](API.md).

| Tool | Dendrite endpoint |
|---|---|
| `evacuate_room` | `POST /_dendrite/admin/evacuateRoom/{roomID}` |
| `purge_room` | `POST /_dendrite/admin/purgeRoom/{roomID}` |
| `download_room_state` | `GET /_dendrite/admin/downloadState/{serverName}/{roomID}` |
| `evacuate_user` | `POST /_dendrite/admin/evacuateUser/{userID}` |
| `reset_password` | `POST /_dendrite/admin/resetPassword/{userID}` |
| `refresh_devices` | `POST /_dendrite/admin/refreshDevices/{userID}` |
| `whois` | `GET /_matrix/client/v3/admin/whois/{userId}` |
| `register_user` | `GET`+`POST /_synapse/admin/v1/register` (shared-secret HMAC flow) |
| `list_registration_tokens` / `get_registration_token` / `create_registration_token` / `update_registration_token` / `delete_registration_token` | `/_dendrite/admin/registrationTokens*` |
| `send_server_notice` | `POST /_synapse/admin/v1/send_server_notice` |
| `fulltext_reindex` | `GET /_dendrite/admin/fulltext/reindex` |

`purge_room` and `evacuate_*` are irreversible/disruptive — see `CLAUDE.md` for guidance on when an agent should confirm before calling them.

## Connecting a remote client (HTTP transport)

Once deployed with `MCP_TRANSPORT=http`, point a client at `http://<host>:3939/mcp` with
an `Authorization: Bearer <MCP_AUTH_TOKEN>` header. `<host>` can be a LAN IP or a
Tailscale IP/MagicDNS name — whichever the client can reach.

**Claude Code:**

```bash
claude mcp add --transport http dendrite-admin --scope user \
  http://<host>:3939/mcp \
  --header "Authorization: Bearer <MCP_AUTH_TOKEN>"
```

**opencode** (`~/.config/opencode/opencode.jsonc` for a user-wide server):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "dendrite-admin": {
      "type": "remote",
      "url": "http://<host>:3939/mcp",
      "headers": { "Authorization": "Bearer <MCP_AUTH_TOKEN>" }
    }
  }
}
```

**Codex CLI** (`~/.codex/config.toml`):

```toml
[mcp_servers.dendrite-admin]
url = "http://<host>:3939/mcp"
bearer_token_env_var = "DENDRITE_ADMIN_MCP_TOKEN"
```

`bearer_token_env_var` names an environment variable Codex reads at startup —
export it in your shell profile, e.g. `export DENDRITE_ADMIN_MCP_TOKEN=<MCP_AUTH_TOKEN>`.
