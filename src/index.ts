#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { createClientFromEnv } from "./headless-records-client.js";
import { createToolHandler, toolDefinitions } from "./tools.js";
import { redactSecrets } from "./errors.js";

async function main(): Promise<void> {
  const server = new Server(
    {
      name: "headless-records",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  const client = createClientFromEnv();
  const handleTool = createToolHandler(client);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...toolDefinitions]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawInput } = request.params;
    return handleTool(name, rawInput);
  });

  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown MCP startup error.";
  console.error(redactSecrets(message));
  process.exit(1);
});
