# Coding Agent Task Manifest

```yaml
task_id:
change_id:
repo: etvjay/0-infinity
base_commit:
branch:
role: builder | tester | reviewer | integrator
objective:
read_first:
  - docs/BINANCE_AGENT_BUILD_GUIDE.md
  - docs/canonical/BINANCE_SOURCE_TRUTH.md
  - docs/canonical/GROUND_TRUTH.md
  - docs/canonical/PRODUCT_SPEC.md
  - docs/canonical/PRODUCT_SCHEMA.md
  - docs/canonical/ARCHITECTURE.md
  - docs/canonical/WORKFLOWS.md
  - docs/development/INVARIANTS.md
  - docs/development/INTERFACES.md
  - docs/development/AUTHORITY_MAP.md
  - docs/development/changes/<change>.md
requirements: []
allowed_files: []
forbidden_files: []
required_commands: [npm run check, npm test]
negative_mutations: []
deliverables: [files changed, commit SHA, command receipts, test receipts, unresolved risks, canonical handoff]
```
