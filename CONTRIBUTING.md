# Contributing

## Quick Fixes (typos, code samples, clarity)

Open a PR directly—we'll review fast.

## Content Requests & Issues

Before spending significant time on new topics or major rewrites, **open an issue first** to discuss:

- Missing/wrong information
- New topics to cover
- Architectural changes

This saves everyone time and ensures alignment with the project's goals.

## Exploiting Cunningham's Law

This is a living document that intentionally posts "wrong answers" to get better ones. Disagree? Great—open an issue or PR with your reasoning.

## Development Workflow

1. Fork and clone the repo
2. Create a feature branch
3. Make your changes
4. Run `bun run check` and `bun run test`
5. Create a changeset: `bun scripts/changeset-named.ts "description"`
6. Submit a PR

For documentation changes:
- Edit files in `skills/effect-solutions/topics/`
- Follow existing patterns and tone
- Keep examples concise and practical
- Test locally with `bun run dev`

## Adding New Documentation

### File Structure

Documentation files live in `skills/effect-solutions/topics/` and follow this naming pattern:

```
NN-slug.md          # NN = sort order (00-99), slug = URL path
```

Examples:
- `00-quick-start.md` → `/quick-start`
- `04-services-and-layers.md` → `/services-and-layers`
- `13-cli.md` → `/cli`

### Frontmatter

Every documentation file requires YAML frontmatter at the top:

```yaml
---
title: Command-Line Interfaces
description: "Build CLIs with @effect/cli"
order: 13
group: Ecosystem
---
```

**Required fields:**
- `title` - Page title shown in navigation and metadata
- `description` - Brief summary for SEO and previews
- `order` - Sort order (must match the NN prefix in filename)

**Optional fields:**
- `group` - Organizes docs on homepage (see Groups section below)
- `draft` - Set to `true` to hide from production (shown only in dev mode)

### Groups

Documentation is organized into groups on the homepage via the `group` frontmatter field:

- **Setup** (`group: Setup`) - Getting started guides, project setup
- **Core Patterns** (default if unspecified) - Core Effect patterns and best practices
- **Ecosystem** (`group: Ecosystem`) - @effect packages like cli, platform, rpc

**Drafts:**
- Add `draft: true` to frontmatter to mark as draft
- Drafts appear only in dev mode and override group assignment
- Once ready, remove `draft: true` and assign a proper group

Example draft:
```yaml
---
title: Incremental Adoption
description: "Strategies for gradually introducing Effect into existing codebases"
order: 10
draft: true
---
```

### Testing Documentation

**IMPORTANT:** All code examples in documentation must have corresponding tests to ensure correctness.

1. Create a test file in `tests/` matching your doc filename:
   - Doc: `skills/effect-solutions/topics/13-cli.md`
   - Test: `tests/13-cli.test.ts`

2. Test all code examples from your documentation:
   ```typescript
   import { describe, expect, it } from "vitest"
   import { Effect } from "effect"

   describe("CLI Documentation Examples", () => {
     it("should demonstrate the pattern correctly", async () => {
       // Test your example code here
     })
   })
   ```

3. Run tests before submitting:
   ```bash
   bun run test              # Run all tests
   bun run typecheck:docs    # Type check docs
   ```

### Open Graph Images

After adding new documentation, generate Open Graph images for social sharing:

```bash
bun --cwd packages/website run generate:og
```

This creates PNG images in `packages/website/public/og/` that are automatically used in page metadata.

To regenerate only specific docs:
```bash
OG_ONLY=slug1,slug2 bun --cwd packages/website run generate:og
```

### Workflow for Adding Docs

1. **Create the markdown file** in `skills/effect-solutions/topics/`:
   ```bash
   # Choose next available number in sequence
   touch skills/effect-solutions/topics/14-your-topic.md
   ```

2. **Add frontmatter** with title, description, order, and group

3. **Write content** following existing patterns:
   - Use clear, concise language
   - Include practical code examples
   - Add inline comments to explain non-obvious code
   - Link to official Effect docs for deeper dives

4. **Create test file** in `tests/`:
   ```bash
   touch tests/14-your-topic.test.ts
   ```

5. **Test all examples** - Ensure every code block works correctly

6. **Generate OG images**:
   ```bash
   bun --cwd packages/website run generate:og
   ```

7. **Test locally**:
   ```bash
   bun run dev              # Start dev server
   bun run test             # Run tests
   bun run check            # Run linting and type checks
   ```

8. **Create changeset** (for published packages):
   ```bash
   bun scripts/changeset-named.ts "add incremental adoption guide"
   ```

9. **Submit PR** following the Development Workflow above

### MDX Components

Custom components available in documentation:

- **Code blocks** - Automatic syntax highlighting via Shiki
- **Copy buttons** - Automatically added to code blocks
- **LLM instructions** - Button to copy AI-friendly content
- **Table of contents** - Auto-generated from headings

Example code block:
````markdown
```typescript
import { Effect } from "effect"

const program = Effect.succeed(42)
```
````
