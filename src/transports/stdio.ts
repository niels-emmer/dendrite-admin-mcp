import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Config } from "../config.js";
import type { DendriteClient } from "../dendriteClient.js";
import { registerAllTools } from "../tools/index.js";

export async function startStdioServer(client: DendriteClient, config: Config): Promise<void> {
  const server = new McpServer({ name: "dendrite-admin-mcp", version: "0.1.0" });
  registerAllTools(server, client, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
