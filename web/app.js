(() => {
  'use strict';
  const config = window.__ZERO_INFINITY_CONFIG__ || {};
  const apiBase = typeof config.apiBase === 'string' ? config.apiBase.replace(/\/$/, '') : '';
  const $ = (id) => document.getElementById(id);
  const demo = { version:'local-demo-v1', ready:false, mode:'demo-fixture', liveWrites:false, hostedEvidence:false };
  function setState(connected, readiness) {
    const c = $('connection');
    c.textContent = connected ? 'API · connected' : 'API · unavailable';
    c.className = `pill ${connected ? 'green' : 'neutral'}`;
    $('api-url').textContent = apiBase || 'No API base configured';
    if (readiness) {
      $('readiness-title').textContent = readiness.ready ? 'Service reports ready' : 'Local bounded state';
      $('readiness-badge').textContent = readiness.ready ? 'READY' : 'BOUNDED';
      $('readiness-badge').className = `badge ${readiness.ready ? 'green' : 'amber'}`;
      $('blocker').textContent = readiness.hostedEvidence ? 'Hosted evidence is reported by the configured service.' : 'Hosted evidence is not present. Static Pages hosts this UI only; REST and MCP remain local until a server host is configured.';
    }
  }
  function renderLatency(payload) {
    const trace = payload && payload.trace;
    const metrics = trace && trace.reasoning && trace.reasoning.metrics;
    const hot = trace && trace.hotPath && trace.hotPath.metrics;
    $('reasoning-time').textContent = Number.isFinite(metrics?.reasoningMs) ? `${metrics.reasoningMs} ms` : 'NOT MEASURED';
    $('trigger-decision').textContent = Number.isFinite(hot?.triggerToDecisionMs) ? `${hot.triggerToDecisionMs} ms` : 'NOT MEASURED';
    $('mandate-armed').textContent = trace?.mandateArmedAt ?? 'NOT MEASURED';
    $('valid-for').textContent = trace?.validForMs !== undefined ? `${trace.validForMs} ms` : 'NOT MEASURED';
    $('evaluations').textContent = Number.isSafeInteger(trace?.evaluationCount) ? String(trace.evaluationCount) : '0';
    $('no-second-llm').textContent = trace?.modelCallsAfterMandateArmed === 0 ? '0 CALLS' : 'NOT MEASURED';
  }
  async function refresh() {
    if ($('demo-toggle').checked) { setState(false, demo); renderLatency(null); $('receipt-hash').textContent = 'demo fixture has no receipt hash'; return; }
    if (!apiBase) { setState(false, null); renderLatency(null); $('receipt-hash').textContent = 'no API configured'; return; }
    try {
      const response = await fetch(`${apiBase}/readiness`, { headers: { accept:'application/json' }, credentials:'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const readiness = await response.json();
      setState(true, readiness);
      renderLatency(readiness);
      const caps = await fetch(`${apiBase}/capabilities`, { headers: { accept:'application/json' }, credentials:'omit' }).then(r => r.ok ? r.json() : null);
      $('receipt-hash').textContent = caps ? 'available after a workflow receipt is returned' : 'capabilities unavailable';
    } catch (error) { setState(false, null); renderLatency(null); $('receipt-hash').textContent = 'API did not return a receipt'; }
  }
  $('refresh').addEventListener('click', refresh);
  $('demo-toggle').addEventListener('change', refresh);
  refresh();
})();
