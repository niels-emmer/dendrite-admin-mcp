# dendrite-admin-mcp

An MCP (Model Context Protocol) server that exposes [Dendrite](https://github.com/matrix-org/dendrite)'s
admin API as tools, so an LLM agent can administer a Matrix homeserver:
manage users, evacuate/purge rooms, send server notices, manage registration
tokens, and more.

## Install (quickstart)

> Written for both humans and installing agents. If an agent is installing this
> server, follow these steps in order — clone, configure, build, test, register.

**Prerequisites:** Node.js >= 18 and npm.

```bash
git clone <this-repo-url> && cd dendrite-admin-mcp
npm ci
npm run setup
```

`npm run setup` prompts for the values below, writes `.env`, installs
dependencies, builds, and runs the test suite. Non-interactive (for agents):

```bash
npm run setup -- --base-url <url> --admin-token <token> \
  [--shared-secret <secret>] [--transport stdio|http]
```

Prefer not to run the setup script? Copy the template and fill it in manually:

```bash
cp .env.example .env   # then edit .env with your values
```

| Value | Required | Where to find it |
|---|---|---|
| `DENDRITE_BASE_URL` | yes | Your homeserver's client-facing URL, e.g. `https://matrix.example.com` |
| `DENDRITE_ADMIN_TOKEN` | yes | Access token of a Dendrite **server admin** user (e.g. from Element → Settings → Sessions, or the account configured as admin in `dendrite.yaml`) |
| `DENDRITE_REGISTRATION_SHARED_SECRET` | no | `registration_shared_secret` from `dendrite.yaml` — only needed for the `register_user` tool |

> **The server refuses to start without `DENDRITE_BASE_URL` and
> `DENDRITE_ADMIN_TOKEN`** (fail-fast). The registration snippets below pass
> them to the spawned process via `env` — either inline, or exported in your
> shell before starting the agent. `.env` is the record of these values and the
> Docker `env_file`; the server itself reads env vars from the agent's config.

Then register the server with your agent — pick one:

### Claude Code

User-scoped (all projects):

```bash
claude mcp add --transport stdio --scope user dendrite-admin \
  --env DENDRITE_BASE_URL=https://matrix.example.com \
  --env DENDRITE_ADMIN_TOKEN=<admin-token> \
  -- node <repo>/dist/index.js
```

Or project-scoped `.mcp.json` in this repo (env vars must be exported):

```json
{
  "mcpServers": {
    "dendrite-admin": {
      "type": "stdio",
      "command": "node",
      "args": ["${CLAUDE_PROJECT_DIR:-.}/dist/index.js"],
      "env": {
        "DENDRITE_BASE_URL": "${DENDRITE_BASE_URL}",
        "DENDRITE_ADMIN_TOKEN": "${DENDRITE_ADMIN_TOKEN}"
      }
    }
  }
}
```

### Codex

```bash
codex mcp add dendrite-admin \
  --env DENDRITE_BASE_URL=https://matrix.example.com \
  --env DENDRITE_ADMIN_TOKEN=<admin-token> \
  -- node <repo>/dist/index.js
```

Or `~/.codex/config.toml`:

```toml
[mcp_servers.dendrite-admin]
command = "node"
args = ["<repo>/dist/index.js"]
enabled = true

[mcp_servers.dendrite-admin.env]
DENDRITE_BASE_URL = "https://matrix.example.com"
DENDRITE_ADMIN_TOKEN = "<admin-token>"
```

### opencode

Add to `opencode.json` (or `opencode.jsonc`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "dendrite-admin": {
      "type": "local",
      "command": ["node", "<repo>/dist/index.js"],
      "environment": {
        "DENDRITE_BASE_URL": "https://matrix.example.com",
        "DENDRITE_ADMIN_TOKEN": "<admin-token>"
      },
      "enabled": true
    }
  }
}
```

Or: `opencode mcp add dendrite-admin -- node <repo>/dist/index.js`
(opencode v2 nests servers under `mcp.servers`).

### GitHub Copilot

```bash
copilot mcp add dendrite-admin \
  --env DENDRITE_BASE_URL=https://matrix.example.com \
  --env DENDRITE_ADMIN_TOKEN=<admin-token> \
  -- node <repo>/dist/index.js
```

Or `~/.copilot/mcp-config.json`:

```json
{
  "mcpServers": {
    "dendrite-admin": {
      "type": "local",
      "command": "node",
      "args": ["<repo>/dist/index.js"],
      "env": {
        "DENDRITE_BASE_URL": "https://matrix.example.com",
        "DENDRITE_ADMIN_TOKEN": "<admin-token>"
      },
      "tools": ["*"]
    }
  }
}
```

(VS Code uses `.vscode/mcp.json` with a `servers` key instead — see the
[VS Code docs](https://code.visualstudio.com/docs/agent-customization/mcp-servers).)

### Pi

`~/.pi/agent/mcp.json` (global) or `.mcp.json` in a trusted project:

```json
{
  "mcpServers": {
    "dendrite-admin": {
      "command": "node",
      "args": ["<repo>/dist/index.js"],
      "env": {
        "DENDRITE_BASE_URL": "https://matrix.example.com",
        "DENDRITE_ADMIN_TOKEN": "<admin-token>"
      }
    }
  }
}
```

### Verify

After registering, ask your agent to list tools — you should see the 15 tools
below. Or run the suite directly: `npm test`.

## Configuration

| Env var | Required | Purpose |
|---|---|---|
| `DENDRITE_BASE_URL` | yes | Base URL of the homeserver's client-facing port, e.g. `https://matrix.example.com` |
| `DENDRITE_ADMIN_TOKEN` | yes | Access token of a Dendrite server admin user; sent as a Bearer token to all `/_dendrite/admin` and most `/_synapse/admin` endpoints |
| `DENDRITE_REGISTRATION_SHARED_SECRET` | no | `registration_shared_secret` from `dendrite.yaml`; only needed for the `register_user` tool, which authenticates via HMAC instead of the admin token |
| `MCP_TRANSPORT` | no | `stdio` (default) or `http` |
| `MCP_AUTH_TOKEN` | http only | Bearer token gating `/mcp`; generate with `openssl rand -hex 32` |
| `MCP_HTTP_HOST` / `MCP_HTTP_PORT` | http only | Bind address (default `0.0.0.0`) and port (default `3939`) |

## Transports

This server supports two MCP transports, selected via `MCP_TRANSPORT`:

- **`stdio`** (default) — for a client that spawns this process directly (e.g. a local Claude Code / editor MCP config). No network exposure.
- **`http`** — runs a stateless Streamable HTTP MCP server on `MCP_HTTP_HOST:MCP_HTTP_PORT` (default `0.0.0.0:3939`), for remote clients over LAN/Tailscale. Requires `MCP_AUTH_TOKEN`; every request to `/mcp` must send `Authorization: Bearer <token>`.

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

## Development

```bash
npm test          # node:test suite (30 tests)
npm run typecheck # tsc --noEmit (src + tests)
npm run build     # tsc -> dist/
```