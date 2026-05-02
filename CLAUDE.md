# Effect Solutions

Effect best practices and patterns for humans and AI agents — https://www.effect.solutions

> **Living Document**: This is an opinionated collection exploiting Cunningham's Law ("the best way to get the right answer on the internet is not to ask a question; it's to post the wrong answer"). Disagree with a recommendation? Think we should cover something? [Open an issue](https://github.com/kitlangton/effect-solutions/issues/new)

## Project Structure

- `packages/website/` - Documentation site (Next.js)
- `packages/cli/` - CLI for local docs access
- `.github/workflows/` - Automated validation & bots

## Quick Links

- **Website**: https://www.effect.solutions
- **CLI**: `bunx effect-solutions@latest list`

## Local Reference Repos

- Effect core monorepo (source for `@effect/*`, including `@effect/vitest` / `it.layer`): `/Users/kit/code/effectful/repos/effect`

## Development

```bash
bun install          # Install dependencies
bun run dev          # Website dev server
bun run dev:cli      # CLI dev mode
bun run check        # Biome (writes), tsc --build, tests
bun --cwd packages/website run format  # Format website/docs
bun --cwd packages/website run generate:og  # Rebuild Open Graph images
```

### Open Graph Images

The Playwright generator lives at `packages/website/scripts/generate-og.ts` and renders the static template in `packages/website/src/app/og/template/page.tsx`. Run `bun --cwd packages/website run generate:og` to refresh every image (or `OG_ONLY=slug1,slug2 bun --cwd packages/website run generate:og` to target a subset). The resulting PNGs are written to `packages/website/public/og/` and referenced automatically in the Next.js metadata.

## Changesets & Publishing

```bash
bun scripts/changeset-named.ts "description"  # Create named changeset
bun release                                    # Version + tag packages, push tags for CI publish
```

**Creating changesets:**

- Use `bun scripts/changeset-named.ts "fix audio overlap"` to create descriptive changeset files
- Avoids random names like "purple-olives-look.md"
- Script prompts for package selection and change type interactively
- Resulting file: `.changeset/fix-audio-overlap.md`

**Change types:**

- `patch` - Bug fixes, docs updates, minor tweaks
- `minor` - New features, backwards-compatible changes
- `major` - Breaking changes

## Workspace

Bun workspace with `workspaces: ["packages/*"]`. Effect Language Service configured via `tsconfig.base.json`.

## Design Notes

UI components use hard edges; no border radius (use `rounded-none` or omit rounding).

## Writing Style

- Avoid em dashes (—). Use semicolons, commas, or separate sentences instead.

## Documentation Structure

Documentation lives in `skills/effect-solutions/topics/`. Each file follows this pattern:

```
NN-slug.md          # NN = sort order (00-99)
```

Files are processed by Next.js and rendered with MDX support. The slug becomes the URL path.

### Adding New Docs

1. Create new file in `skills/effect-solutions/topics/` with proper numbering
2. Add frontmatter with title, description, and optionally group
3. **Create corresponding test file in `tests/`** - All code examples must have tests to ensure they're correct
4. Run `bun --cwd packages/website run generate:og` to create social images
5. Test locally with `bun run dev`
6. Run `bun run test` to verify all examples work
7. Run `bun run check` before committing — it regenerates `SKILL.md` (and any generator-tracked artifacts) so the agent-skill index stays in sync with topic frontmatter

### Frontmatter Groups

Docs are organized into groups on the homepage via the `group` frontmatter field:

- **Setup**: Getting started guides (`group: Setup`)
- **Core Patterns**: Default if unspecified (`group: Core Patterns`)
- **Ecosystem**: @effect packages like cli, platform, rpc (`group: Ecosystem`)
- **Drafts**: Shown in dev only when `draft: true` (overrides group)

Valid values: `Setup`, `Core Patterns`, `Ecosystem`

```yaml
---
title: Command-Line Interfaces
description: "Build CLIs with @effect/cli"
order: 13
group: Ecosystem
---
```

### Doc Typechecking Tips

- `bun run typecheck:docs` extracts every ```ts/```typescript code block and compiles it as an isolated module. Keep snippets self-contained.
- Use `// hide-start` / `// hide-end` inside code fences to include helper stubs (types, imports, small services) that are needed for typechecking but should not render in the docs. This keeps examples focused while staying type-safe.

### MDX Components

Custom components available in docs:

- Code blocks with syntax highlighting (via Shiki)
- Copy buttons on code blocks
- LLM instructions button for AI-friendly content
- Automatic table of contents generation

## CLI Package

The CLI (`packages/cli/`) provides offline access to documentation:

```bash
bunx effect-solutions list          # List all topics
bunx effect-solutions show <slug>   # Show specific topic (supports multiple)
bunx effect-solutions open-issue    # Leave feedback
```

Built with Effect CLI and Schema for validation (from `effect/Schema`). Tests in `packages/cli/src/cli.test.ts` validate all commands.

**Maintenance:** When adding/removing docs, update the topics list in:
- `<!-- effect-solutions:start -->` block at the bottom of this file
- `packages/website/src/lib/llm-instructions.ts` (the template for agent files)
- `skills/effect-solutions/SKILL.md` is regenerated automatically by `bun run check` (and `bun release`) — do not edit by hand

Run `bun run dev:cli -- list` to see current non-draft topics.

## Testing

**Documentation Tests** (`/tests`):
- Use vitest + @effect/vitest for testing doc examples
- Each non-draft doc should have a corresponding test file
- Ensures all code examples are real and work correctly
- Run: `bunx vitest run tests/`

**CLI Tests** (`packages/cli/`):
- Use bun:test for standalone CLI package tests
- Run: `cd packages/cli && bun test`

**All Tests**:
- Run: `bun run test` (runs doc tests with vitest)
- Type checking: `bunx tsc --build --force`
- Doc type checking: `bun run typecheck:docs`
- Linting: `bunx biome check .`

## Deployment

Website deploys automatically via Vercel on push to `main`.

CLI package publishes to npm via changesets workflow:

```bash
bun scripts/changeset-named.ts "description"  # Create changeset
bun release                                    # Version + tag packages, push tags for CI publish
```

### Release flow (tag → CI → publish)

- Tags (`effect-solutions@*`) are created by `changeset tag` inside `bun release`, which also pushes them.
- Pushing the tag triggers `.github/workflows/release.yml`, which:
  - installs deps with Bun
  - builds multi-arch CLI binaries via the package `prepublishOnly` (darwin arm64/x64, linux x64 baseline, linux arm64)
  - runs `changeset publish` with provenance using `NPM_TOKEN`
- The CLI npm package ships a tiny `bin.js` launcher that selects a prebuilt binary for supported platforms; unsupported platforms print a helpful error.

Manual local publish (fallback):

```bash
bun run build:cli          # builds manifest + JS + all binaries
(cd packages/cli && npm publish)
```

## Architecture Notes

### Website

Next.js app router with:

- Static generation for all docs pages
- MDX processing via `next-mdx-remote`
- Tailwind CSS for styling
- Shiki for syntax highlighting
- Custom MDX components for enhanced code blocks

### CLI

Effect-based CLI using:

- `@effect/cli` for command parsing
- `effect/Schema` for validation
- `@effect/platform` for file I/O
- Embedded JSON docs bundle



<!-- effect-solutions:start -->
## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `~/.local/share/effect-solutions/effect` for real implementations

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.
<!-- effect-solutions:end -->
