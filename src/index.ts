import { serve } from "@hono/node-server";
import app from "./app.js";

const rawPort = Number(process.env.PORT ?? 3000);
const PORT = Number.isInteger(rawPort) && rawPort > 0 && rawPort < 65536 ? rawPort : 3000;

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`nikke-data-api listening on http://localhost:${info.port}`);
});
