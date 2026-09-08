import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (name: string) => readFileSync(join(root, name), "utf8");

test("judge UI exists with truthful operating states and workflow pipeline", () => {
  for (const file of ["web/index.html", "web/styles.css", "web/app.js", "docs/WEB_UI.md", "docs/DEPLOYMENT.md", "docs/SUBMISSION.md", ".github/workflows/pages.yml", "src/product/server.ts", "src/product/mcp-server.ts"]) assert.ok(existsSync(join(root, file)), file);
  const html = read("web/index.html");
  for (const label of ["Workflow", "Try", "Integrate", "Proof", "PAPER", "SHADOW", "TESTNET", "LIVE", "Evidence", "Opposition", "Council", "ReasoningReceipt", "TradeThesis", "Mandate", "Economics", "Evaluation", "Intent / Refusal", "Receipt", "HOSTED REST", "HOSTED NETWORK MCP", "HOSTED SDK", "BINANCE PUBLIC MARKET READ", "AGENTIC MCP", "AUTH_BLOCKED_EXTERNAL", "CREDENTIAL_REQUIRED", "NOT AUTHORIZED", "hostedEvidence=false"]) assert.match(html, new RegExp(label.replace(/[ /]/g, "[ /]")), label);
});

test("static UI uses configurable API base and explicit demo opt-in", () => {
  const app = read("web/app.js");
  assert.match(app, /window\.__ZERO_INFINITY_CONFIG__/);
  assert.match(app, /demo/i);
  assert.match(app, /credentials|Authorization/i);
  assert.doesNotMatch(app, /private[_-]?key|secret\s*[:=]/i);
});

test("Pages workflow publishes only the static web directory", () => {
  const workflow = read(".github/workflows/pages.yml");
  assert.match(workflow, /path:\s*web/);
  assert.match(workflow, /actions\/upload-pages-artifact/);
  assert.match(workflow, /actions\/deploy-pages/);
  assert.doesNotMatch(workflow, /secrets\./);
});
