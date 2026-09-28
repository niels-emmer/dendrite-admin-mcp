# dendrite-admin-mcp API

> Machine-readable description for agent integration. Keep this file current — agents read it instead of probing the service.

This is an MCP (Model Context Protocol) server that exposes [Dendrite](https://github.com/element-hq/dendrite)'s
admin API as tools. It has two surfaces:

1. **The MCP server's own HTTP surface** (only when `MCP_TRANSPORT=http`) — `/healthz` and the `/mcp` JSON-RPC endpoint.
2. **The underlying Dendrite admin API** each MCP tool wraps — the endpoints below are what the tools call on the homeserver.

Base URL (this server, HTTP transport): `http://<host>:3939`
Base URL (Dendrite homeserver): `$DENDRITE_BASE_URL` (e.g. `https://matrix.example.com`)
Version: 0.1.0

## Auth

Two independent bearer tokens, plus one HMAC flow:

| Scheme | Where used | Env var |
|--------|-----------|---------|
| `Authorization: Bearer <admin token>` | All `/_dendrite/admin`, `/_synapse/admin` (except register), `/_matrix/client/v3/admin` calls | `DENDRITE_ADMIN_TOKEN` |
| `Authorization: Bearer <mcp token>` | `POST /mcp` on this server's HTTP transport | `MCP_AUTH_TOKEN` |
| HMAC-SHA1 shared secret (no bearer token) | `register_user` only — see below | `DENDRITE_REGISTRATION_SHARED_SECRET` |

## This server's HTTP surface (`MCP_TRANSPORT=http`)

### GET /healthz
Liveness probe for the Docker healthcheck. No auth.

Example:
```bash
curl -s http://localhost:3939/healthz   # -> "ok" (200)
```

### POST /mcp
MCP Streamable HTTP endpoint (JSON-RPC 2.0). Stateless — every request is
independent (no session IDs); a fresh server instance handles each request.
Supports the standard MCP methods: `initialize`, `tools/list`, `tools/call`.

Auth: `Authorization: Bearer $MCP_AUTH_TOKEN` (required; 401 without it).

Example (list tools):
```bash
curl -s -X POST http://localhost:3939/mcp \
  -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

`GET /mcp` and `DELETE /mcp` return 405 (auth still required).

## MCP tools → Dendrite admin endpoints

Each tool maps 1:1 to a Dendrite endpoint. Tool results are JSON text; on a
non-2xx response the tool returns `isError: true` with
`Dendrite admin API responded <status>: <body>`.

| Tool | Method + path on Dendrite | Destructive |
|------|---------------------------|-------------|
| `evacuate_room` | `POST /_dendrite/admin/evacuateRoom/{roomID}` | disruptive |
| `purge_room` | `POST /_dendrite/admin/purgeRoom/{roomID}` | **irreversible** |
| `download_room_state` | `GET /_dendrite/admin/downloadState/{serverName}/{roomID}` | no |
| `evacuate_user` | `POST /_dendrite/admin/evacuateUser/{userID}` | disruptive |
| `reset_password` | `POST /_dendrite/admin/resetPassword/{userID}` | disruptive |
| `refresh_devices` | `POST /_dendrite/admin/refreshDevices/{userID}` | no |
| `whois` | `GET /_matrix/client/v3/admin/whois/{userId}` | no |
| `register_user` | `GET` + `POST /_synapse/admin/v1/register` (HMAC, no bearer) | no |
| `list_registration_tokens` | `GET /_dendrite/admin/registrationTokens` | no |
| `get_registration_token` | `GET /_dendrite/admin/registrationTokens/{token}` | no |
| `create_registration_token` | `POST /_dendrite/admin/registrationTokens/new` | no |
| `update_registration_token` | `PUT /_dendrite/admin/registrationTokens/{token}` | no |
| `delete_registration_token` | `DELETE /_dendrite/admin/registrationTokens/{token}` | yes |
| `send_server_notice` | `POST /_synapse/admin/v1/send_server_notice` | no |
| `fulltext_reindex` | `GET /_dendrite/admin/fulltext/reindex` | expensive |

### Room tools

#### evacuate_room
Part all local users from a room.

Params: `roomId` (string, required) — e.g. `!abc123:example.com`

Example:
```bash
curl -X POST "$DENDRITE_BASE_URL/_dendrite/admin/evacuateRoom/%21abc123%3Aexample.com" \
  -H "Authorization: Bearer $DENDRITE_ADMIN_TOKEN"
```

#### purge_room
Remove a room and all its events from Dendrite's database. Does not delete
associated media. **Irreversible** — confirm before calling.

Params: `roomId` (string, required)

Example:
```bash
curl -X POST "$DENDRITE_BASE_URL/_dendrite/admin/purgeRoom/%21abc123%3Aexample.com" \
  -H "Authorization: Bearer $DENDRITE_ADMIN_TOKEN"
```

#### download_room_state
Fetch room state as seen by a specific federated server (debugging state
resolution / federation).

Params: `serverName` (string, required) — e.g. `matrix.org`; `roomId` (string, required)

Example:
```bash
curl -X GET "$DENDRITE_BASE_URL/_dendrite/admin/downloadState/matrix.org/%21abc123%3Aexample.com" \
  -H "Authorization: Bearer $DENDRITE_ADMIN_TOKEN"
```

### User tools

#### evacuate_user
Part a local user from every room they are joined to.

Params: `userId` (string, required) — e.g. `@alice:example.com`

Example:
```bash
curl -X POST "$DENDRITE_BASE_URL/_dendrite/admin/evacuateUser/%40alice%3Aexample.com" \
  -H "Authorization: Bearer $DENDRITE_ADMIN_TOKEN"
```

#### reset_password
Set a new password for a local user, optionally invalidating all existing
access tokens.

Params: `userId` (string, required), `password` (string, required),
`logoutDevices` (boolean, default `true`)

Body: `{ "password": "...", "logout_devices": true }`

Example:
```bash
curl -X POST "$DENDRITE_BASE_URL/_dendrite/admin/resetPassword/%40alice%3Aexample.com" \
  -H "Authorization: Bearer $DENDRITE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password":"newpass123","logout_devices":true}'
```

#### refresh_devices
Immediately query a federated user's `/devices` endpoint, refreshing cached
device/cross-signing keys (fixes encryption issues with remote users).

Params: `userId` (string, required) — e.g. `@bob:otherserver.com`

Example:
```bash
curl -X POST "$DENDRITE_BASE_URL/_dendrite/admin/refreshDevices/%40bob%3Aotherserver.com" \
  -H "Authorization: Bearer $DENDRITE_ADMIN_TOKEN"
```

#### whois
Retrieve connection/session information Dendrite holds about a user.

Params: `userId` (string, required)

Example:
```bash
curl -X GET "$DENDRITE_BASE_URL/_matrix/client/v3/admin/whois/%40alice%3Aexample.com" \
  -H "Authorization: Bearer $DENDRITE_ADMIN_TOKEN"
```

#### register_user
Create a new local account via shared-secret registration. **Does not use the
admin bearer token.** Two-step flow:

1. `GET /_synapse/admin/v1/register` (unauthenticated) returns a `nonce`.
2. Compute `mac = HMAC-SHA1(nonce + "\0" + username + "\0" + password + "\0" + ("admin"|"notadmin"), registration_shared_secret)` and POST it back.

Params: `username` (string, required — localpart only), `password` (string, required),
`admin` (boolean, default `false`), `displayname` (string, optional)

Body: `{ "nonce": "...", "username": "alice", "password": "...", "admin": false, "displayname": "Alice", "mac": "<hex>" }`

Example (step 1):
```bash
curl -s "$DENDRITE_BASE_URL/_synapse/admin/v1/register"   # -> {"nonce":"..."}
```

Example (step 2, with `$NONCE` and `$MAC` from the HMAC above):
```bash
curl -X POST "$DENDRITE_BASE_URL/_synapse/admin/v1/register" \
  -H "Content-Type: application/json" \
  -d "{\"nonce\":\"$NONCE\",\"username\":\"alice\",\"password\":\"secret\",\"admin\":false,\"mac\":\"$MAC\"}"
```

### Registration token tools

#### list_registration_tokens
List registration tokens, optionally filtered by validity.

Params: `valid` (boolean, optional)

Example:
```bash
curl -X GET "$DENDRITE_BASE_URL/_dendrite/admin/registrationTokens?valid=true" \
  -H "Authorization: Bearer $DENDRITE_ADMIN_TOKEN"
```

#### get_registration_token
Fetch a single registration token.

Params: `token` (string, required)

Example:
```bash
curl -X GET "$DENDRITE_BASE_URL/_dendrite/admin/registrationTokens/TOKEN123" \
  -H "Authorization: Bearer $DENDRITE_ADMIN_TOKEN"
```

#### create_registration_token
Create a registration token. Omit `token` to have Dendrite generate a random one.

Params: `token` (string, optional), `usesAllowed` (int, optional),
`expiryTime` (int, optional — Unix ms), `length` (int, optional — random token length)

Body: `{ "token": "...", "uses_allowed": 5, "expiry_time": 1750000000000, "length": 16 }`

Example:
```bash
curl -X POST "$DENDRITE_BASE_URL/_dendrite/admin/registrationTokens/new" \
  -H "Authorization: Bearer $DENDRITE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uses_allowed":5,"length":16}'
```

#### update_registration_token
Modify usage limit, expiry, or validity of an existing token.

Params: `token` (string, required), `usesAllowed` (int or null, optional),
`expiryTime` (int or null, optional), `pending` (int, optional), `completed` (int, optional)

Body: `{ "uses_allowed": 10, "expiry_time": null, "pending": 1, "completed": 4 }`

Example:
```bash
curl -X PUT "$DENDRITE_BASE_URL/_dendrite/admin/registrationTokens/TOKEN123" \
  -H "Authorization: Bearer $DENDRITE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uses_allowed":10}'
```

#### delete_registration_token
Permanently delete a registration token.

Params: `token` (string, required)

Example:
```bash
curl -X DELETE "$DENDRITE_BASE_URL/_dendrite/admin/registrationTokens/TOKEN123" \
  -H "Authorization: Bearer $DENDRITE_ADMIN_TOKEN"
```

### Notice tools

#### send_server_notice
Send a server notice (an `m.text` message from the server) to a local user.
Requires server notices configured in `dendrite.yaml`.

Params: `userId` (string, required), `body` (string, required)

Body: `{ "user_id": "@alice:example.com", "content": { "msgtype": "m.text", "body": "..." } }`

Example:
```bash
curl -X POST "$DENDRITE_BASE_URL/_synapse/admin/v1/send_server_notice" \
  -H "Authorization: Bearer $DENDRITE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"@alice:example.com","content":{"msgtype":"m.text","body":"Scheduled maintenance tonight."}}'
```

### Search tools

#### fulltext_reindex
Trigger a reindex of all searchable events (`m.room.message`, `m.room.topic`,
`m.room.name`). Can be expensive on large homeservers.

Params: none

Example:
```bash
curl -X GET "$DENDRITE_BASE_URL/_dendrite/admin/fulltext/reindex" \
  -H "Authorization: Bearer $DENDRITE_ADMIN_TOKEN"
```

## Conventions

- **Errors**: non-2xx from Dendrite → tool returns `isError: true` with message `Dendrite admin API responded <status>: <body>`. On the HTTP transport, `/mcp` returns 401 (bad/missing token), 405 (wrong method), 500 (internal).
- **Rate limits**: none imposed by this server; respect the homeserver's.
- **Idempotency**: `GET`/`DELETE` are safe to retry; `POST`/`PUT` may have side effects. `purge_room` and `evacuate_*` are destructive — confirm before calling.
- **Path encoding**: room IDs and user IDs contain `!`, `@`, `:` — URL-encode them in path segments (see examples).