import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { DendriteClient } from "../dendriteClient.js";
import { registerRoomTools } from "./rooms.js";
import { registerUserTools } from "./users.js";
import { registerNoticeTools } from "./notices.js";
import { registerSearchTools } from "./search.js";

export function registerAllTools(server: McpServer, client: DendriteClient, config: Config) {
  registerRoomTools(server, client);
  registerUserTools(server, client, config);
  registerNoticeTools(server, client);
  registerSearchTools(server, client);
}
