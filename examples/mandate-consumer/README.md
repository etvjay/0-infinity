# Portable mandate consumer

This consumer uses only public package exports:

```bash
node verify.mjs mandate.json
```

It verifies canonical integrity, workflow/thesis binding when supplied by the caller, expiry, execution bounds, and Reasoning Receipt provenance links. It does not import repository source or execute a venue action. Verification provides canonical structural/integrity assurance, not a cryptographic signature claim.
