import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "server_time",
  title: "Server time",
  description: "Return the current server time in ISO 8601 UTC format.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
  handler: () => {
    const now = new Date().toISOString();
    return {
      content: [{ type: "text", text: now }],
      structuredContent: { iso: now, epoch_ms: Date.now() },
    };
  },
});

// Silence unused import warning for z (kept for consistency with tool template).
void z;
