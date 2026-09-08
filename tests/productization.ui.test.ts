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
  assert.match(app, /textContent/);
});
test("Pages workflow publishes only the static web directory", () => {
  const workflow = read(".github/workflows/pages.yml");
  assert.match(workflow, /path:\s*web/);
  assert.match(workflow, /actions\/upload-pages-artifact/);
  assert.match(workflow, /actions\/deploy-pages/);
  assert.doesNotMatch(workflow, /secrets\./);
});
