# Effect Solutions

**Effect best practices and patterns** — https://www.effect.solutions

> **Living Document**: Opinionated collection exploiting Cunningham's Law. Disagree? [Open an issue](https://github.com/kitlangton/effect-solutions/issues/new)

## What is this?

Curated Effect TypeScript patterns for common scenarios — error handling, services, layers, testing, and more. For humans and AI agents.

## Usage

**Website**: Browse at [effect.solutions](https://www.effect.solutions)

**CLI**: Access docs offline
```bash
bunx effect-solutions list              # List all topics
bunx effect-solutions show http-clients # Show specific topic
bunx effect-solutions open-issue        # Leave feedback
```

**Agent Skill**: Install into your local agent skills directory so Skill-aware agents auto-discover it
```bash
npx skills add kitlangton/effect-solutions     # via skills.sh
gh skill install kitlangton/effect-solutions   # via GitHub CLI
```

## Features

- **Practical patterns** - Real-world solutions, not just theory
- **Type-safe examples** - All code validated with Effect LSP
- **AI-friendly** - Structured for LLM consumption via CLI
- **Community-driven** - Open issues to suggest/debate patterns

## Quick Examples

**Error handling**
```typescript
import { Effect } from "effect"

Effect.gen(function* () {
  const user = yield* findUser(id).pipe(
    Effect.catchTag("NotFound", () => Effect.succeed(null))
  )
})
```

**HTTP client setup**
```typescript
import { Effect, HttpClient } from "effect"
import { FetchHttpClient } from "@effect/platform"

const program = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient
  const result = yield* http.get("/api/users")
})

program.pipe(
  Effect.provide(FetchHttpClient.layer)
)
```

See [effect.solutions](https://www.effect.solutions) for full patterns and rationale.

## Contributing

1. Find a missing pattern or disagree with a recommendation
2. [Open an issue](https://github.com/kitlangton/effect-solutions/issues/new) to discuss
3. Submit PR with pattern + tests
4. Create changeset: `bun scripts/changeset-named.ts "description"`

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details and [CLAUDE.md](./CLAUDE.md) for development workflow.

## Releasing (tags auto-publish)

1. Apply changesets and bump versions: `bun run version` (creates tag `vX.Y.Z`).
2. Push the tag/commit to GitHub.
3. The `Release` workflow builds multi-arch CLI binaries and runs `changeset publish` to publish all packages to npm.

## Packages

- `effect-solutions` - CLI for local docs
- Website at [effect.solutions](https://www.effect.solutions)

## License

MIT
