import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DendriteClient } from "../dendriteClient.js";
import { run } from "./helpers.js";

export function registerSearchTools(server: McpServer, client: DendriteClient) {
  server.registerTool(
    "fulltext_reindex",
    {
      title: "Reindex full-text search",
      description:
        "Trigger a reindex of all searchable events (m.room.message, m.room.topic, m.room.name). Can be expensive on large homeservers.",
      inputSchema: {},
    },
    async () => run(() => client.request("GET", "/_dendrite/admin/fulltext/reindex")),
  );
}
