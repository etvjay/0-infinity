# Web UI

The `web/` directory is a dependency-free, static judge-facing surface. It shows the decision pipeline, reasoning-stack composition, provenance posture, and authority/readiness boundaries.

## Local use

```bash
npm run api                 # REST at http://127.0.0.1:8787
python3 -m http.server 4173 --directory web
```

To connect the static page to the local REST service, open the browser console before loading the page and set `window.__ZERO_INFINITY_CONFIG__ = { apiBase: 'http://127.0.0.1:8787' }`, or serve a small wrapper that defines that value before `app.js`. The default has no API base and therefore makes no network claim. The **Use local demo fixture** switch is an explicit opt-in and is labeled as demo; it is not evidence.

The UI sends `credentials: omit`, has no credential fields, and exposes no write controls. It does not infer live/testnet state from a failed request.
