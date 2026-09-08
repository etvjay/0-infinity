(() => {
  'use strict';
  const config = window.__ZERO_INFINITY_CONFIG__ || {};
  const HOSTED_RUNTIME = 'https://http--zero-infinity-runtime--tw56snbf4tjj.code.run';
  const apiBase = typeof config.apiBase === 'string' ? config.apiBase.replace(/\/$/, '') : HOSTED_RUNTIME;
  const $ = (id) => document.getElementById(id);
  const state = { mode: 'SHADOW', side: 'LONG', workflowId: null, payload: null };
  const examples = {
    rest: { label: 'REST / POST /v1/shadow', text: `curl -X POST "$ZERO_INFINITY_API/v1/shadow" \\\n  -H 'content-type: application/json' \\\n  -d '{"symbol":"BTCUSDT","side":"LONG"}'` },
    mcp: { label: 'MCP / JSON-RPC tool documentation', text: `MCP endpoint: $ZERO_INFINITY_API/mcp\n\nTools exposed by the hosted network MCP surface:\nget_capabilities\nget_readiness\ncreate_workflow\nsubmit_opportunity\nget_workflow\nget_reasoning_receipt\nget_trade_thesis\nrun_shadow_workflow\nrun_paper_live\n\nThis tab documents the MCP contract; the browser does not pretend to be an MCP client.` },
    sdk: { label: 'SDK / ZeroInfinityClient', text: `const client = new ZeroInfinityClient(fetch, apiBase);\nconst workflow = await client.createWorkflow({ symbol: "BTCUSDT", side: "LONG" });\nconst receipt = await client.getReasoningReceipt(workflow.workflowId);\nconst result = await client.runPaperLiveWorkflow({ symbol: "BTCUSDT", side: "LONG" });` }
  };
  function setStatus(text, kind = 'neutral') { const el = $('api-state'); el.textContent = text; el.className = `status ${kind}`; }
  function setSequence(step, outcome = 'Awaiting bounded workflow.') {
    const items = $('result-sequence').querySelectorAll('li');
    items.forEach((item, i) => item.classList.toggle('current', i === step));
    items[0].querySelector('small').textContent = `POST /v1/${state.mode === 'PAPER' ? 'paper-live' : 'shadow'} · ${state.side} · BTCUSDT`;
    items[1].querySelector('small').textContent = step > 0 ? 'Service returned a bounded workflow result.' : 'Awaiting bounded workflow.';
    items[2].querySelector('small').textContent = outcome;
  }
  function findText(value, keys) {
    if (!value || typeof value !== 'object') return null;
    for (const key of keys) if (typeof value[key] === 'string' || typeof value[key] === 'number') return value[key];
    for (const child of Object.values(value)) { const found = findText(child, keys); if (found !== null) return found; }
    return null;
  }
  function findObject(value, keys) {
    if (!value || typeof value !== 'object') return null;
    for (const key of keys) if (value[key] && typeof value[key] === 'object') return value[key];
    for (const child of Object.values(value)) { const found = findObject(child, keys); if (found) return found; }
    return null;
  }
  function addDetail(parent, summary, entries) {
    const detail = document.createElement('details');
    const heading = document.createElement('summary'); heading.textContent = summary; detail.append(heading);
    const list = document.createElement('dl');
    for (const [label, value] of entries) {
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
      const term = document.createElement('dt'); term.textContent = label;
      const description = document.createElement('dd'); description.textContent = Array.isArray(value) ? value.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join(' · ') : typeof value === 'object' ? JSON.stringify(value) : String(value);
      list.append(term, description);
    }
    if (list.children.length) detail.append(list); else { const empty = document.createElement('p'); empty.textContent = 'No value returned.'; detail.append(empty); }
    parent.append(detail);
  }
  function renderStructuredDetails(payload) {
    const receipt = findObject(payload, ['receipt']);
    const result = payload?.result && typeof payload.result === 'object' ? payload.result : {};
    const thesis = result?.thesis && typeof result.thesis === 'object' ? result.thesis : findObject(payload, ['thesis']) || {};
    const council = receipt?.council || {};
    const evidence = receipt?.evidence || {};
    const analyses = receipt?.analyses || {};
    const output = receipt?.output || {};
    const rationale = receipt?.rationale || {};
    const container = $('narrative-details'); container.replaceChildren();
    addDetail(container, 'Advocate support', [['artifact reference', analyses.advocate], ['strongest support', council.strongestSupport]]);
    addDetail(container, 'Opposer challenge', [['artifact reference', analyses.oppose], ['strongest opposition', council.strongestOpposition]]);
    addDetail(container, 'Market Analyst evidence', [['artifact reference', analyses.market]]);
    addDetail(container, 'Council decision / confidence', [['decision', council.decision], ['direction', council.direction], ['confidence', council.confidence], ['expected move (bps)', council.expectedMoveBps], ['horizon (ms)', council.horizonMs]]);
    const refLabel = (ref) => ref && typeof ref === 'object' ? `${ref.ref || 'reference'} · ${ref.hash || 'hash unavailable'}` : ref;
    addDetail(container, 'Supporting evidence', [['references', (evidence.supporting || []).map(refLabel)], ['bundle hash', evidence.evidenceBundleHash]]);
    addDetail(container, 'Opposing evidence', [['references', (evidence.opposing || []).map(refLabel)]]);
    const claims = Array.isArray(rationale.claims) ? rationale.claims : [];
    addDetail(container, 'Assumptions', [['claim assumptions', claims.flatMap(claim => claim.assumptions || [])]]);
    addDetail(container, 'Unresolved uncertainty', [['items', council.unresolved]]);
    addDetail(container, 'Invalidation', [['conditions', council.invalidation]]);
    addDetail(container, 'Hashes', [['evidence bundle', evidence.evidenceBundleHash], ['council decision', output.councilDecisionHash], ['trade thesis', output.tradeThesisHash], ['reasoning receipt', receipt?.canonicalSha256]]);
    addDetail(container, 'Economics', [['thesis economics', thesis.economics], ['returned edge (bps)', findText(payload, ['executableEdgeBps', 'edgeBps'])], ['returned costs (bps)', findText(payload, ['costBps', 'costsBps'])], ['required edge (bps)', findText(payload, ['requiredEdgeBps', 'requiredBps'])]]);
    addDetail(container, 'Paper receipt', [['mode', payload?.mode], ['no-write', payload?.noWrite], ['outcome', payload?.paperReceipt?.outcome], ['client order', payload?.paperReceipt?.clientOrderId], ['intent fingerprint', payload?.paperReceipt?.intentFingerprint], ['economics', payload?.paperReceipt?.economics], ['simulated', payload?.paperReceipt?.simulated]]);
    $('narrative').hidden = false;
  }
  function renderResult(payload) {
    state.payload = payload;
    state.workflowId = findText(payload, ['workflowId']);
    const status = findText(payload, ['status', 'outcome', 'decision']) || 'RETURNED';
    const refusal = String(status).toUpperCase().includes('REFUS') || String(status).toUpperCase().includes('COLLAPSED');
    setStatus('API · connected', 'good');
    setSequence(2, String(status));
    $('outcome').className = `outcome ${refusal ? 'refusal-outcome' : ''}`;
    $('outcome').querySelector('strong').textContent = refusal ? `REFUSED · ${status}` : `ACTUAL · ${status}`;
    $('outcome').querySelector('p').textContent = payload?.noWrite === true ? 'No exchange write occurred. The service returned this bounded result.' : 'Returned by the configured service. Verify authority before acting.';
    $('receipt-link').disabled = !state.workflowId;
    $('raw-link').disabled = false;
    $('mandate-link').disabled = true;
    $('edge-value').textContent = findText(payload, ['executableEdgeBps', 'edgeBps']) ?? '—';
    $('cost-value').textContent = findText(payload, ['costBps', 'costsBps']) ?? '—';
    $('threshold-value').textContent = findText(payload, ['requiredEdgeBps', 'requiredBps']) ?? '—';
    renderStructuredDetails(payload);
    $('raw-json').textContent = JSON.stringify(payload, null, 2);
  }
  async function callWorkflow(event) {
    event.preventDefault();
    const endpoint = state.mode === 'PAPER' ? '/v1/paper-live' : '/v1/shadow';
    setStatus('CALLING · no-write', 'working'); setSequence(1); $('run-demo').disabled = true;
    try {
      const response = await fetch(`${apiBase}${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, credentials: 'omit', body: JSON.stringify({ symbol: $('symbol').value, side: state.side }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      renderResult(payload);
    } catch (error) {
      setStatus('API · unavailable', 'bad'); setSequence(0, `No result: ${error.message}`); $('outcome').querySelector('strong').textContent = 'NO RESULT'; $('outcome').querySelector('p').textContent = 'The configured REST service did not respond. No fallback or fabricated result is shown.';
    } finally { $('run-demo').disabled = false; }
  }
  $('demo-form').addEventListener('submit', callWorkflow);
  document.querySelectorAll('[data-side]').forEach((button) => button.addEventListener('click', () => { state.side = button.dataset.side; document.querySelectorAll('[data-side]').forEach((b) => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', b === button ? 'true' : 'false'); }); }));
  document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => { state.mode = button.dataset.mode; document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('selected', b === button)); $('run-demo').textContent = `Run ${state.mode} →`; }));
  $('receipt-link').addEventListener('click', async () => { if (!state.workflowId) return; try { const response = await fetch(`${apiBase}/v1/workflows/${encodeURIComponent(state.workflowId)}/receipt`, { credentials: 'omit' }); const payload = await response.json(); $('raw-json').textContent = JSON.stringify(payload, null, 2); $('raw-json').hidden = false; } catch { $('raw-json').textContent = 'Receipt unavailable from configured service.'; $('raw-json').hidden = false; } });
  $('raw-link').addEventListener('click', () => { $('raw-json').hidden = !$('raw-json').hidden; });
  document.querySelectorAll('[data-tab]').forEach((tab) => tab.addEventListener('click', () => { document.querySelectorAll('[data-tab]').forEach((t) => { t.classList.toggle('active', t === tab); t.setAttribute('aria-selected', t === tab ? 'true' : 'false'); }); const example = examples[tab.dataset.tab]; $('code-label').textContent = example.label; $('code-example').textContent = example.text; }));
  $('copy-code').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('code-example').textContent); $('copy-code').textContent = 'Copied'; setTimeout(() => { $('copy-code').textContent = 'Copy'; }, 1200); } catch { $('copy-code').textContent = 'Select manually'; } });
})();
