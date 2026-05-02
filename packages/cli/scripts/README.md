# CLI Scripts

## generate-manifest.ts

Auto-generates `src/docs-manifest.ts` by scanning `skills/effect-solutions/topics/*.md` files.

**Run manually:**
```bash
bun run generate:manifest
```

**Auto-runs:**
- Before publishing (`prepublishOnly` hook)
- Manually when adding/renaming docs

The generated manifest bundles all markdown docs into the compiled CLI executable.
