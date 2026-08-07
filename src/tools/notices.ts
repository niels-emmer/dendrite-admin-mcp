import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DendriteClient } from "../dendriteClient.js";
import { run } from "./helpers.js";

export function registerNoticeTools(server: McpServer, client: DendriteClient) {
  server.registerTool(
    "send_server_notice",
    {
      title: "Send a server notice",
      description:
        "Send a server notice (an m.text message from the server) to a specific local user. Requires server notices to be configured in dendrite.yaml.",
      inputSchema: {
        userId: z.string().describe("Fully-qualified user ID to notify, e.g. @alice:example.com"),
        body: z.string().min(1).describe("Plain-text body of the notice"),
      },
    },
    async ({ userId, body }) =>
      run(() =>
        client.request("POST", "/_synapse/admin/v1/send_server_notice", {
          body: { user_id: userId, content: { msgtype: "m.text", body } },
        }),
      ),
  );
}
