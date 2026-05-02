---
title: Project Setup
description: "Install the Effect Language Service and strict project defaults"
order: 1
group: Setup
---

# Project Setup

This guide covers:
1. **Effect Language Service**: Editor diagnostics and build-time type checking
2. **Reference Repositories**: Local reference repositories for AI assistance

For a well-configured Effect project, install the Effect Language Service and set up local context for AI-assisted development.

## Effect Language Service

The [Effect Language Service](https://github.com/Effect-TS/language-service) provides editor diagnostics and compile-time type checking. This guide covers installation and setup.

### Installation

```bash
bun add -d @effect/language-service
```

Add the plugin to `tsconfig.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/Effect-TS/language-service/refs/heads/main/schema.json",
  "compilerOptions": {
    "plugins": [
      {
        "name": "@effect/language-service"
      }
    ]
  }
}
```

The `$schema` field enables autocomplete and validation for plugin options in your editor.

For monorepos, install in the root and configure in the root `tsconfig.json`.

### Editor Setup

Your editor must use the **workspace** TypeScript version (not its built-in one) for the plugin to load.

**VS Code / Cursor:**

1. Add to `.vscode/settings.json`:

```json
{
  "typescript.tsdk": "./node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

2. Press F1 → "TypeScript: Select TypeScript version"
3. Choose "Use workspace version"

**JetBrains (WebStorm, IntelliJ):** Select the workspace TypeScript version in Settings → Languages & Frameworks → TypeScript.

**NVim (vtsls):** See [how to enable TypeScript plugins in vtsls](https://github.com/yioneko/vtsls?tab=readme-ov-file#typescript-plugin-not-activated).

**Emacs:** See [step-by-step instructions](https://gosha.net/2025/effect-ls-emacs/).

### Enable Build-Time Diagnostics

Patch TypeScript to get Effect diagnostics during compilation:

```bash
bunx effect-language-service patch
```

Add to `package.json` to persist across installs:

```json
{
  "scripts": {
    "prepare": "effect-language-service patch"
  }
}
```

## Reference Repositories

We recommend cloning the Effect source locally so your AI agent can grep through real implementations, type definitions, and patterns.

The v4 source lives in [`Effect-TS/effect-smol`](https://github.com/Effect-TS/effect-smol). Clone it to a shared location to avoid re-cloning per project:

```bash
git clone --depth 1 https://github.com/Effect-TS/effect-smol.git ~/.local/share/effect-solutions/effect
```

To update later: `git -C ~/.local/share/effect-solutions/effect pull --depth 1`

Then add a reference in `CLAUDE.md` or `AGENTS.md`:
```markdown
## Local Effect Source

The Effect v4 repository is cloned to `~/.local/share/effect-solutions/effect` for reference.
Use this to explore APIs, find usage examples, and understand implementation
details when the documentation isn't enough.
```

Your agent can now search the actual Effect source code for implementation patterns, API usage examples, and detailed type definitions.

## TypeScript Configuration

Effect projects benefit from strict TypeScript configuration for safety and performance.

**See:** [TypeScript Configuration](./02-tsconfig.md)