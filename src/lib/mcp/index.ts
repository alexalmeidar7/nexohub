import { defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import serverTimeTool from "./tools/server-time";

export default defineMcp({
  name: "nexohub-mcp",
  title: "NexoHub MCP",
  version: "0.1.0",
  instructions:
    "Tools for the NexoHub broadcast platform. Use `echo` to verify connectivity and `server_time` to get the current UTC time.",
  tools: [echoTool, serverTimeTool],
});
