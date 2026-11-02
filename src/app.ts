// Node entrypoint — eagerly builds the app over the filesystem data dir.
// Workers import ./factory.js directly (R2/Pages storage, no fs).
import { createApp } from "./factory.js";
import { fsStorage } from "./storage.js";

const app = await createApp(fsStorage(process.env.NIKKE_DATA_DIR ?? "data/dist"));
export default app;
export { makeNikkeMatchers, resolvePaging } from "./factory.js";
