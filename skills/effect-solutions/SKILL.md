---
name: effect-solutions
description: "Effect TypeScript best practices: services, layers, error handling, schema-based data modeling, configuration, and testing. Use when writing, reviewing, or refactoring Effect code in TypeScript projects. Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli."
license: MIT
metadata:
  author: Kit Langton
  version: "0.5.3"
---
# Effect Solutions

Curated Effect TypeScript patterns for common scenarios: error handling, services, layers, testing, and more. For humans and AI agents.

Browse the full site at https://www.effect.solutions or use the `effect-solutions` CLI for offline access.

## Topics

### Setup

- **quick-start:** How to get started with Effect Solutions (`topics/00-quick-start.md`)
- **project-setup:** Install the Effect Language Service and strict project defaults (`topics/01-project-setup.md`)
- **tsconfig:** Recommended TypeScript compiler settings tuned for Effect (`topics/02-tsconfig.md`)

### Core Patterns

- **basics:** Coding conventions for Effect.fn and Effect.gen (`topics/03-basics.md`)
- **services-and-layers:** Context.Service and Layer patterns for dependency injection (`topics/04-services-and-layers.md`)
- **data-modeling:** Records, variants, brands, pattern matching, and JSON serialization (`topics/05-data-modeling.md`)
- **error-handling:** Schema.TaggedError modeling, pattern matching, and defects (`topics/06-error-handling.md`)
- **config:** Effect Config usage, providers, and layer patterns (`topics/07-config.md`)
- **testing:** How to test Effect code with @effect/vitest (`topics/08-testing.md`)

### Ecosystem

- **cli:** Build CLIs with Effect's CLI module: commands, arguments, flags, and service integration (`topics/13-cli.md`)

## How to Use

When working on Effect TypeScript code, identify the relevant topics from the index above and read the corresponding file from `topics/<NN-slug>.md` (paths are listed in parentheses next to each topic). Each topic file is self-contained; read only what is relevant to the current task instead of loading every topic at once.

Always consult these topics before guessing at Effect APIs or patterns.
