export const API_BASE = (
  import.meta.env.VITE_API_BASE ||
  "https://nikke-api-edge.leegunwoo0325-5e6.workers.dev"
).replace(/\/$/, "");

export const MCP_URL = API_BASE + "/mcp";
