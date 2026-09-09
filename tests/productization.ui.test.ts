import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (name: string) => readFileSync(join(root, name), "utf8");

test("public IA is landing plus exactly three app routes", () => {
  for (const file of ["web/index.html", "web/app/demo/index.html", "web/app/integrate/index.html", "web/app/try/index.html", "web/404.html", "web/styles.css", "web/app.js", "docs/WEB_UI.md", ".github/workflows/pages.yml"]) assert.ok(existsSync(join(root, file)), file);
  const html = read("web/index.html");
  const app = read("web/app.js");
  assert.match(html, /href="\/0-infinity\/app\/demo\/"/);
  assert.match(html, /href="\/0-infinity\/app\/integrate\/"/);
  assert.match(html, /href="\/0-infinity\/app\/try\/"/);
  assert.doesNotMatch(html, /id="app"|id="demo-panel"|id="integrate-panel"|id="try-panel"/);
  for (const [route, heading] of [["demo", "demo-panel"], ["integrate", "integrate-panel"], ["try", "try-panel"]] as const) {
    const page = read(`web/app/${route}/index.html`);
    assert.match(page, new RegExp(`id="${heading}"`));
    assert.doesNotMatch(page, /id="landing"|id="hero-title"/);
  }
  assert.doesNotMatch(html, /Markets|Portfolio|Analytics|Bots|Strategies|Activity|Settings/);
  for (const label of ["ARMED", "TRIGGERED", "VALIDATING", "SUBMITTING", "ACKNOWLEDGED", "PARTIALLY_FILLED", "FILLED", "REFUSED", "INVALIDATED", "EXPIRED", "SUPERSEDED", "CANCELLED", "FAILED", "UNKNOWN"]) assert.match(app, new RegExp(label), label);
});

test("demo is a read-only canonical workflow proof surface", () => {
  const demo = read("web/app/demo/index.html");
  const stages = ["ARMED", "TRIGGERED", "VALIDATING", "SUBMITTING", "ACKNOWLEDGED", "PARTIALLY_FILLED", "FILLED", "REFUSED", "INVALIDATED", "EXPIRED", "SUPERSEDED", "CANCELLED", "FAILED", "UNKNOWN"];
  assert.equal((demo.match(/class="stage-card/g) ?? []).length, 14);
  for (const stage of stages) assert.match(demo, new RegExp(`<b>${stage}</b>`), stage);
  for (const artifact of ["Council", "Reasoning Receipt", "Trade Thesis", "Execution Mandate", "Economics", "Outcome", "Receipt"]) assert.match(demo, new RegExp(`<summary>${artifact}</summary>`), artifact);
  assert.match(demo, /ZO-BIN-REASONING-RECEIPT-V2/);
  assert.match(demo, /9007abe64d51f1ed2f2a4c1fcc9a0e8c19fcab5c70be7a9bf376c6f16c4fa794/);
  assert.match(demo, /REFUSE/);
  assert.match(demo, /read-only rendering of accepted repository evidence/);
  assert.doesNotMatch(demo, /<form|<input|<select|<button/i);
  assert.doesNotMatch(demo, /POST\s+\/v1\/(shadow|paper-live)/i);
});

test("static UI uses configurable API base and explicit demo opt-in", () => {
  const app = read("web/app.js");
  assert.match(app, /window\.__ZERO_INFINITY_CONFIG__/);
  assert.match(app, /demo/i);
  assert.match(app, /credentials|Authorization/i);
  assert.doesNotMatch(app, /private[_-]?key|secret\s*[:=]/i);
});

test("result narrative is expandable and never renders private reasoning fields", () => {
  const html = read("web/app/try/index.html");
  const app = read("web/app.js");
  assert.match(html, /<details|narrative-details/);
  for (const banned of [/chainOfThought/i, /privateReasoning/i, /thoughtProcess/i]) {
    assert.doesNotMatch(app, banned);
  }
  assert.match(app, /document\.createElement\('details'\)/);
  assert.match(app, /sessionStorage/);
  assert.match(app, /restoreTryResult/);
});
test("Pages workflow publishes only the static web directory", () => {
  const workflow = read(".github/workflows/pages.yml");
  assert.match(workflow, /path:\s*web/);
  assert.match(workflow, /actions\/upload-pages-artifact/);
  assert.match(workflow, /actions\/deploy-pages/);
  assert.doesNotMatch(workflow, /secrets\./);
});
