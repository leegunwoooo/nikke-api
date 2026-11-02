export const API_BASE = (
  import.meta.env.VITE_API_BASE ||
  "https://nikke-api.pages.dev"
).replace(/\/$/, "");

export const MCP_URL = API_BASE + "/mcp";
