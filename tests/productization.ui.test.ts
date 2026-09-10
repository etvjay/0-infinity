import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (name: string) => readFileSync(join(root, name), "utf8");
const stages = ["Opportunity", "Challenge", "Judgment", "Authority", "Reality"];

test("public IA is landing plus exactly three app routes", () => {
  for (const file of ["web/index.html", "web/app/demo/index.html", "web/app/integrate/index.html", "web/app/try/index.html", "web/404.html", "web/styles.css", "web/app.js", "docs/WEB_UI.md", ".github/workflows/pages.yml"]) assert.ok(existsSync(join(root, file)), file);
  const landing = read("web/index.html");
  assert.match(landing, /href="\/0-infinity\/app\/demo\/"/);
  assert.match(landing, /href="\/0-infinity\/app\/integrate\/"/);
  assert.match(landing, /href="\/0-infinity\/app\/try\/"/);
  assert.doesNotMatch(landing, /dashboard|portfolio|markets page|bot management/i);
  for (const route of ["demo", "try", "integrate"]) {
    const page = read(`web/app/${route}/index.html`);
    assert.match(page, /<h1/);
    assert.doesNotMatch(page, /id="landing"|id="hero-title"/);
  }
});

test("landing introduces the five-stage product model", () => {
  const landing = read("web/index.html");
  for (const value of ["The control layer between intelligence and execution", "Evidence before action", ...stages, "Open Demo", "Integrate 0∞", "Try the runtime"]) assert.match(landing, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), value);
  assert.match(landing, /A Council approval is not an order|authority/i);
  assert.doesNotMatch(landing, /deposit|fund your 0-infinity account|profitability claim/i);
});

test("demo renders one continuous five-stage read-only story", () => {
  const demo = read("web/app/demo/index.html");
  for (const stage of stages) assert.match(demo, new RegExp(`id="stage-${stage.toLowerCase()}"`), stage);
  for (const artifact of ["Reasoning Receipt", "Trade Thesis", "Execution Mandate", "EDGE_COLLAPSED", "What happens to the mandate?"]) assert.match(demo, new RegExp(artifact, "i"), artifact);
  assert.match(demo, /APPROVED[\s\S]*does not mean[\s\S]*EXECUTE/);
  assert.match(demo, /no financial write|read-only/i);
  assert.doesNotMatch(demo, /<form|<input|<select/i);
});

test("try uses the five-stage result vocabulary and three supported modes", () => {
  const page = read("web/app/try/index.html");
  for (const stage of stages) assert.match(page, new RegExp(stage), stage);
  for (const mode of ["ADVISORY", "SHADOW", "PAPER"]) assert.match(page, new RegExp(mode), mode);
  for (const question of ["WHAT YOU SUBMITTED", "WHAT THE SYSTEM FOUND", "WHAT THE COUNCIL DECIDED", "WHAT AUTHORITY EXISTS", "WHAT HAPPENED"]) assert.match(page, new RegExp(question), question);
  assert.match(page, /no financial write|no live financial write/i);
  assert.doesNotMatch(page, /data-mode="TESTNET"/);
});

test("integrate is task-driven and explains all four developer jobs", () => {
  const surface = `${read("web/app/integrate/index.html")}\n${read("web/app.js")}`;
  for (const task of ["Use 0-infinity", "Bring intelligence", "Receive a mandate", "Connect execution"]) assert.match(surface, new RegExp(task), task);
  for (const label of ["MCP", "REST", "SDK", "RoleAdapter", "RoleArtifact", "MANDATE VERIFIED", "VenueConnection", "Advocate", "Opposer", "Market Analyst", "Council"]) assert.match(surface, new RegExp(label), label);
  assert.match(surface, /role="tablist"/);
  assert.match(surface, /role="tabpanel"/);
  assert.match(surface, /no custody language|venue authorization/i);
});

test("shared frontend renderer contains canonical five-stage and terminal semantics", () => {
  const app = read("web/app.js");
  for (const value of ["ADVISORY", "MANDATE ISSUED", "NO MANDATE", "EXECUTION REFUSED", "EDGE_COLLAPSED", "five-stage", "verify-link"]) assert.match(app, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), value);
  assert.match(app, /runAdvisory|\/v1\/advisory/);
  assert.doesNotMatch(app, /privateReasoning|chainOfThought|thoughtProcess/i);
});

test("static UI uses configurable API base and no credential storage", () => {
  const app = read("web/app.js");
  assert.match(app, /window\.__ZERO_INFINITY_CONFIG__/);
  assert.match(app, /credentials:\s*'omit'/);
  assert.doesNotMatch(app, /private[_-]?key|secret\s*[:=]/i);
});

test("Pages workflow publishes only the static web directory", () => {
  const workflow = read(".github/workflows/pages.yml");
  assert.match(workflow, /path:\s*web/);
  assert.match(workflow, /actions\/upload-pages-artifact/);
  assert.match(workflow, /actions\/deploy-pages/);
  assert.doesNotMatch(workflow, /secrets\./);
});
