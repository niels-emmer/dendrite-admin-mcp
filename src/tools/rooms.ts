import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DendriteClient } from "../dendriteClient.js";
import { run } from "./helpers.js";

export function registerRoomTools(server: McpServer, client: DendriteClient) {
  server.registerTool(
    "evacuate_room",
    {
      title: "Evacuate room",
      description:
        "Part all local users from a room. Useful when a room is stuck and needs every local member removed at once.",
      inputSchema: { roomId: z.string().describe("Room ID, e.g. !abc123:example.com") },
    },
    async ({ roomId }) =>
      run(() => client.request("POST", `/_dendrite/admin/evacuateRoom/${encodeURIComponent(roomId)}`)),
  );

  server.registerTool(
    "purge_room",
    {
      title: "Purge room",
      description:
        "Remove a room and all its events from Dendrite's database. Does not delete associated media. Irreversible.",
      inputSchema: { roomId: z.string().describe("Room ID, e.g. !abc123:example.com") },
    },
    async ({ roomId }) =>
      run(() => client.request("POST", `/_dendrite/admin/purgeRoom/${encodeURIComponent(roomId)}`)),
  );

  server.registerTool(
    "download_room_state",
    {
      title: "Download room state from a remote server",
      description:
        "Fetch and return the room state for a given room as seen by a specific federated server. Useful for debugging state resolution and federation issues.",
      inputSchema: {
        serverName: z.string().describe("Server name to query, e.g. matrix.org"),
        roomId: z.string().describe("Room ID, e.g. !abc123:example.com"),
      },
    },
    async ({ serverName, roomId }) =>
      run(() =>
        client.request(
          "GET",
          `/_dendrite/admin/downloadState/${encodeURIComponent(serverName)}/${encodeURIComponent(roomId)}`,
        ),
      ),
  );
}
