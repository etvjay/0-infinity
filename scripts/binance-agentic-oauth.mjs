#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const CLIENT_ID = process.env.BINANCE_OAUTH_CLIENT_ID ?? "https://etvjay.github.io/0-infinity/.well-known/binance-oauth-client.json";
const REDIRECT_URI = process.env.BINANCE_OAUTH_REDIRECT_URI ?? "http://127.0.0.1:8765/callback";
const RESOURCE = "https://agent.binance.com/mcp/agentic";
const AUTHORIZATION_ENDPOINT = "https://accounts.binance.com/agentic-oauth/authorize";
const TOKEN_ENDPOINT = "https://accounts.binance.com/oauth-agentic/token";
const MCP_ENDPOINT = "https://agent.binance.com/mcp/agentic";
const scopes = process.env.BINANCE_OAUTH_SCOPES ?? "";
const listen = process.argv.includes("--listen");
const probe = process.argv.includes("--probe");
process.on("uncaughtException", (error) => { console.error(JSON.stringify({ status: "BLOCKED_EXTERNAL", code: "OAUTH_ABORTED", reason: error instanceof Error ? error.message : "OAuth flow aborted" })); process.exit(2); });
process.on("unhandledRejection", (error) => { console.error(JSON.stringify({ status: "BLOCKED_EXTERNAL", code: "OAUTH_ABORTED", reason: error instanceof Error ? error.message : "OAuth flow aborted" })); process.exit(2); });

function b64url(value) { return value.toString("base64url"); }
function makePkce() { const verifier = b64url(randomBytes(48)); const challenge = b64url(createHash("sha256").update(verifier).digest()); return { verifier, challenge }; }
function parseCallback(value) { const url = new URL(value); return Object.fromEntries(url.searchParams.entries()); }
function safeJson(value) { return JSON.stringify(value, (_key, item) => /token|secret|authorization/i.test(_key) ? "[REDACTED]" : item, 2); }

async function exchange(code, verifier) {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, code_verifier: verifier, resource: RESOURCE });
  const response = await fetch(TOKEN_ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.access_token !== "string") throw new Error(`token exchange failed: HTTP ${response.status}`);
  return result;
}

async function waitForListener(expectedState) {
  const port = Number(new URL(REDIRECT_URI).port || 80);
  return await new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
      if (url.pathname !== new URL(REDIRECT_URI).pathname) { response.writeHead(404); response.end(); return; }
      const result = Object.fromEntries(url.searchParams.entries());
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end("<h2>Authorization received.</h2><p>You can close this tab.</p>");
      server.close();
      if (result.state !== expectedState) reject(new Error("OAuth state mismatch")); else resolve(result);
    });
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => console.error(`OAuth callback listener ready on ${REDIRECT_URI}`));
    setTimeout(() => { server.close(); reject(new Error("OAuth callback timeout")); }, 300_000).unref();
  });
}

async function manualCallback(expectedState) {
  const rl = createInterface({ input, output });
  const raw = await rl.question("Paste the complete redirected URL (or code): ");
  rl.close();
  const result = raw.startsWith("http") ? parseCallback(raw) : { code: raw, state: expectedState };
  if (result.state && result.state !== expectedState) throw new Error("OAuth state mismatch");
  if (!result.code) throw new Error("redirect did not contain an authorization code");
  return result;
}

async function probeMcp(token) {
  const response = await fetch(MCP_ENDPOINT, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "0-infinity-oauth-probe", version: "1" } } }) });
  const result = await response.json().catch(() => ({}));
  return { httpStatus: response.status, jsonrpc: result.jsonrpc, hasError: Boolean(result.error), authenticated: response.ok && !result.error };
}

const { verifier, challenge } = makePkce();
const state = b64url(randomBytes(24));
const authorize = new URL(AUTHORIZATION_ENDPOINT);
for (const [key, value] of Object.entries({ response_type: "code", client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, resource: RESOURCE, state, code_challenge: challenge, code_challenge_method: "S256", ...(scopes ? { scope: scopes } : {}) })) authorize.searchParams.set(key, value);
console.error(`Client metadata: ${CLIENT_ID}`);
console.error(`Redirect URI: ${REDIRECT_URI}`);
console.error("Open this URL in a browser and approve the requested scopes:");
console.error(authorize.toString());
const callback = listen ? await waitForListener(state) : await manualCallback(state);
if (callback.error) throw new Error(`OAuth authorization failed: ${callback.error}`);
const token = await exchange(callback.code, verifier);
const result = { status: "OAUTH_TOKEN_RECEIVED", tokenStored: false, tokenPrinted: false, scope: token.scope ?? null, expiresIn: token.expires_in ?? null };
if (probe) result.mcp = await probeMcp(token.access_token);
console.log(safeJson(result));
