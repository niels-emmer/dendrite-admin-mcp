import { timingSafeEqual } from "node:crypto";
import type { Server } from "node:http";
import type { NextFunction, Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Config } from "../config.js";
import type { DendriteClient } from "../dendriteClient.js";
import { registerAllTools } from "../tools/index.js";

const MCP_PATH = "/mcp";

function methodNotAllowed(_req: Request, res: Response) {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
}

function timingSafeTokenEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Every tool this server exposes talks to a real Dendrite admin API and some
 * are destructive (evacuate/purge). Streamable HTTP has no auth of its own,
 * so a bearer token gate in front of it is not optional here.
 */
function requireAuth(authToken: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const [scheme, token] = (req.header("authorization") || "").split(" ");
    if (scheme !== "Bearer" || !token || !timingSafeTokenEqual(token, authToken)) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized" },
        id: null,
      });
      return;
    }
    next();
  };
}

export async function startHttpServer(client: DendriteClient, config: Config): Promise<Server> {
  const authToken = process.env.MCP_AUTH_TOKEN;
  if (!authToken) {
    throw new Error(
      "MCP_AUTH_TOKEN is required when MCP_TRANSPORT=http — it gates the exposed HTTP endpoint.",
    );
  }

  const host = process.env.MCP_HTTP_HOST || "0.0.0.0";
  const port = Number(process.env.MCP_HTTP_PORT || 3939);

  // Binding to 0.0.0.0 disables the SDK's built-in DNS-rebinding protection
  // (it only applies to localhost hosts); the bearer token above is this
  // server's actual access control for non-local binds.
  const app = createMcpExpressApp({ host });
  const auth = requireAuth(authToken);

  app.get("/healthz", (_req, res) => res.status(200).send("ok"));

  app.post(MCP_PATH, auth, async (req, res) => {
    // Stateless: a fresh server + transport per request keeps this simple
    // and safe to run behind Docker's restart policy with no session state
    // to lose. Tool registration is cheap (in-memory schema wiring only).
    const server = new McpServer({ name: "dendrite-admin-mcp", version: "0.1.0" });
    registerAllTools(server, client, config);

    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        transport.close();
        server.close();
      });
    } catch (err) {
      console.error("Error handling MCP request:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get(MCP_PATH, auth, methodNotAllowed);
  app.delete(MCP_PATH, auth, methodNotAllowed);

  const httpServer = app.listen(port, host, () => {
    console.error(`dendrite-admin-mcp listening on http://${host}:${port}${MCP_PATH}`);
  });
  httpServer.on("error", (err) => {
    console.error("HTTP server error:", err);
    process.exit(1);
  });

  return httpServer;
}
