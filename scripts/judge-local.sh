#!/usr/bin/env bash
set -euo pipefail
npm run check
npm test
npm run web:check
npm run demo
npm run readiness:validate
npm run secret-scan
