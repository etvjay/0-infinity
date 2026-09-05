# 0-infinity Authority Map

| Component | Research | Read market | Read account | Issue thesis | Issue mandate | Validate | Submit/cancel |
|---|---:|---:|---:|---:|---:|---:|---:|
| Evidence worker | ✓ | optional | ✗ | opinion only | ✗ | ✗ | ✗ |
| Oppose worker | ✓ | optional | ✗ | opinion only | ✗ | ✗ | ✗ |
| Market worker | ✗ | ✓ | ✗ | analysis only | ✗ | ✗ | ✗ |
| Evidence Council | ✗ | artifacts | ✗ | ✓ | ✗ | ✗ | ✗ |
| Mandate compiler | ✗ | anchor | policy | ✗ | ✓ | ✗ | ✗ |
| Hot-path evaluator | ✗ | local | local | ✗ | ✗ | ✓ | ✗ |
| OrderWriter | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | **✓** |

Reasoning authority and financial write authority must not collapse into one component.
