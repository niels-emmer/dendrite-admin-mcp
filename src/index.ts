#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { DendriteClient } from "./dendriteClient.js";
import { startStdioServer } from "./transports/stdio.js";
import { startHttpServer } from "./transports/http.js";

async function main() {
  const config = loadConfig();
  const client = new DendriteClient(config);

  const transport = (process.env.MCP_TRANSPORT || "stdio").toLowerCase();
  switch (transport) {
    case "stdio":
      await startStdioServer(client, config);
      break;
    case "http":
      await startHttpServer(client, config);
      break;
    default:
      throw new Error(`Unknown MCP_TRANSPORT '${transport}'; expected 'stdio' or 'http'.`);
  }
}

main().catch((err) => {
  console.error("Fatal error starting dendrite-admin-mcp:", err);
  process.exit(1);
});
