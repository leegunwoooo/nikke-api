// Stop hook: API 표면을 바꿨는데 문서가 안 바뀐 상태로 끝내려 하면 차단.
// API_FILES 중 하나라도 git status에 잡히면 REQUIRED_DOCS도 같이 바뀌어 있어야 함.
import { execSync } from "node:child_process";

const API_FILES = ["src/factory.ts", "src/mcp.ts", "src/openapi.ts"];
const REQUIRED_DOCS = ["README.md", "API.md", "nikke-api.postman_collection.json"];

const cwd = process.env.DEVIN_PROJECT_DIR ?? process.cwd();
const changed = execSync("git status --porcelain", { cwd, encoding: "utf8" })
  .split("\n")
  .map((l) => l.slice(3).split(" -> ").pop().trim())
  .filter(Boolean);

if (!API_FILES.some((f) => changed.includes(f))) process.exit(0);

const missing = REQUIRED_DOCS.filter((f) => !changed.includes(f));
if (missing.length === 0) process.exit(0);

console.log(
  JSON.stringify({
    decision: "block",
    reason:
      `API 파일(${API_FILES.filter((f) => changed.includes(f)).join(", ")})을 바꿨는데 ` +
      `문서가 그대로임: ${missing.join(", ")} — ` +
      `README.md·API.md·nikke-api.postman_collection.json도 함께 갱신하고 npm run emit:pages-worker까지 돌린 뒤 끝낼 것`,
  }),
);
process.exit(2);
