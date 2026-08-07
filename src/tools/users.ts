import { createHmac } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { DendriteClient } from "../dendriteClient.js";
import { run } from "./helpers.js";

interface RegisterNonceResponse {
  nonce: string;
}

export function registerUserTools(server: McpServer, client: DendriteClient, config: Config) {
  server.registerTool(
    "evacuate_user",
    {
      title: "Evacuate user",
      description: "Part a local user from every room they are currently joined to.",
      inputSchema: { userId: z.string().describe("Fully-qualified user ID, e.g. @alice:example.com") },
    },
    async ({ userId }) =>
      run(() => client.request("POST", `/_dendrite/admin/evacuateUser/${encodeURIComponent(userId)}`)),
  );

  server.registerTool(
    "reset_password",
    {
      title: "Reset a user's password",
      description: "Set a new password for a local user, optionally invalidating all of their existing access tokens.",
      inputSchema: {
        userId: z.string().describe("Fully-qualified user ID, e.g. @alice:example.com"),
        password: z.string().min(1).describe("New password"),
        logoutDevices: z.boolean().default(true).describe("Invalidate all existing access tokens for this user"),
      },
    },
    async ({ userId, password, logoutDevices }) =>
      run(() =>
        client.request("POST", `/_dendrite/admin/resetPassword/${encodeURIComponent(userId)}`, {
          body: { password, logout_devices: logoutDevices },
        }),
      ),
  );

  server.registerTool(
    "refresh_devices",
    {
      title: "Refresh a user's devices",
      description:
        "Immediately query a federated user's /devices endpoint, refreshing Dendrite's cached device/cross-signing keys. Useful for resolving encryption issues with remote users.",
      inputSchema: { userId: z.string().describe("Fully-qualified federated user ID, e.g. @bob:otherserver.com") },
    },
    async ({ userId }) =>
      run(() => client.request("POST", `/_dendrite/admin/refreshDevices/${encodeURIComponent(userId)}`)),
  );

  server.registerTool(
    "whois",
    {
      title: "Look up a user's sessions",
      description: "Retrieve connection/session information Dendrite holds about a given user.",
      inputSchema: { userId: z.string().describe("Fully-qualified user ID, e.g. @alice:example.com") },
    },
    async ({ userId }) =>
      run(() => client.request("GET", `/_matrix/client/v3/admin/whois/${encodeURIComponent(userId)}`)),
  );

  server.registerTool(
    "register_user",
    {
      title: "Register a new user via shared-secret registration",
      description:
        "Create a new local account using Dendrite's shared-secret registration flow (registration_shared_secret in dendrite.yaml). Requires DENDRITE_REGISTRATION_SHARED_SECRET to be configured; does not use the admin bearer token.",
      inputSchema: {
        username: z.string().describe("Localpart, e.g. 'alice' for @alice:example.com"),
        password: z.string().min(1),
        admin: z.boolean().default(false).describe("Grant server admin rights to the new user"),
        displayname: z.string().optional(),
      },
    },
    async ({ username, password, admin, displayname }) =>
      run(async () => {
        if (!config.registrationSharedSecret) {
          throw new Error(
            "DENDRITE_REGISTRATION_SHARED_SECRET is not configured; register_user is unavailable.",
          );
        }

        const { nonce } = await client.request<RegisterNonceResponse>(
          "GET",
          "/_synapse/admin/v1/register",
          { auth: false },
        );

        const adminFlag = admin ? "admin" : "notadmin";
        const mac = createHmac("sha1", config.registrationSharedSecret)
          .update(`${nonce}\0${username}\0${password}\0${adminFlag}`)
          .digest("hex");

        return client.request("POST", "/_synapse/admin/v1/register", {
          auth: false,
          body: { nonce, username, password, admin, displayname, mac },
        });
      }),
  );

  server.registerTool(
    "list_registration_tokens",
    {
      title: "List registration tokens",
      description: "List registration tokens, optionally filtered by whether they are still valid.",
      inputSchema: {
        valid: z.boolean().optional().describe("If set, only return tokens matching this validity"),
      },
    },
    async ({ valid }) =>
      run(() => {
        const query = valid === undefined ? "" : `?valid=${valid}`;
        return client.request("GET", `/_dendrite/admin/registrationTokens${query}`);
      }),
  );

  server.registerTool(
    "get_registration_token",
    {
      title: "Get a registration token",
      description: "Fetch details of a single registration token.",
      inputSchema: { token: z.string() },
    },
    async ({ token }) =>
      run(() => client.request("GET", `/_dendrite/admin/registrationTokens/${encodeURIComponent(token)}`)),
  );

  server.registerTool(
    "create_registration_token",
    {
      title: "Create a registration token",
      description:
        "Create a new registration token that can be used to gate new-account registration. Omit 'token' to have Dendrite generate a random one.",
      inputSchema: {
        token: z.string().optional().describe("Explicit token value; random if omitted"),
        usesAllowed: z.number().int().positive().optional().describe("Maximum number of times this token can be used"),
        expiryTime: z.number().int().positive().optional().describe("Unix ms timestamp after which the token is invalid"),
        length: z.number().int().positive().optional().describe("Length of a randomly generated token"),
      },
    },
    async ({ token, usesAllowed, expiryTime, length }) =>
      run(() =>
        client.request("POST", "/_dendrite/admin/registrationTokens/new", {
          body: {
            token,
            uses_allowed: usesAllowed,
            expiry_time: expiryTime,
            length,
          },
        }),
      ),
  );

  server.registerTool(
    "update_registration_token",
    {
      title: "Update a registration token",
      description: "Modify the usage limit, expiry time, or validity of an existing registration token.",
      inputSchema: {
        token: z.string(),
        usesAllowed: z.number().int().positive().nullable().optional(),
        expiryTime: z.number().int().positive().nullable().optional(),
        pending: z.number().int().nonnegative().optional(),
        completed: z.number().int().nonnegative().optional(),
      },
    },
    async ({ token, usesAllowed, expiryTime, pending, completed }) =>
      run(() =>
        client.request("PUT", `/_dendrite/admin/registrationTokens/${encodeURIComponent(token)}`, {
          body: {
            uses_allowed: usesAllowed,
            expiry_time: expiryTime,
            pending,
            completed,
          },
        }),
      ),
  );

  server.registerTool(
    "delete_registration_token",
    {
      title: "Delete a registration token",
      description: "Permanently delete a registration token.",
      inputSchema: { token: z.string() },
    },
    async ({ token }) =>
      run(() => client.request("DELETE", `/_dendrite/admin/registrationTokens/${encodeURIComponent(token)}`)),
  );
}
