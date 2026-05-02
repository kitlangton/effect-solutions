---
title: TypeScript Configuration
description: "Recommended TypeScript compiler settings tuned for Effect"
order: 2
group: Setup
---

# TypeScript Configuration

Effect projects benefit from strict TypeScript configuration.

## Key Settings Explained

### Build Performance

```jsonc
"incremental": true,
"composite": true,
```

- **incremental** - Fast rebuilds via .tsbuildinfo cache
- **composite** - Enables project references for monorepos

### Module System

```jsonc
"target": "ES2022",
"module": "NodeNext",
"moduleDetection": "force",
```

- **ES2022** - Modern JS features (top-level await, etc)
- **NodeNext** - Proper ESM/CJS resolution
- **force** - Treats all files as modules

### Import Handling

```jsonc
"verbatimModuleSyntax": true,
"rewriteRelativeImportExtensions": true,
```

- **verbatimModuleSyntax** - Preserves `import type` syntax exactly
- **rewriteRelativeImportExtensions** - Allows `.ts` in imports

### Type Safety

```jsonc
"strict": true,
"exactOptionalPropertyTypes": true,
"noUnusedLocals": true,
"noImplicitOverride": true,
```

- **strict** - All strict checks enabled
- **exactOptionalPropertyTypes** - `{ x?: number }` can't be `{ x: undefined }`
- **noUnusedLocals** - Catch unused variables
- **noImplicitOverride** - Explicit `override` keyword required

### Development

```jsonc
"declarationMap": true,
"sourceMap": true,
"skipLibCheck": true,
```

- **declarationMap** - Jump-to-definition works for .d.ts
- **sourceMap** - Debugging support
- **skipLibCheck** - Faster builds (skip node_modules type checking)

### Effect Integration

```jsonc
"plugins": [
  {
    "name": "@effect/language-service"
  }
]
```

Add `"$schema": "https://raw.githubusercontent.com/Effect-TS/language-service/refs/heads/main/schema.json"` at the top level of your `tsconfig.json` for autocomplete and validation of plugin options.

Enables Effect language service for editor diagnostics. For build-time diagnostics, run `bunx effect-language-service patch` (see [Project Setup](./01-project-setup.md)).

## Why These Settings?

1. **Performance** - Incremental builds, composite projects
2. **Safety** - Maximum type checking without escape hatches
3. **Modern** - ESM-first, works with Node.js native modules
4. **DX** - Source maps, declaration maps, Effect diagnostics

## Module Settings by Project Type

The key difference between project types is the `module` and `moduleResolution` settings:

### Bundled Apps (Vite, Webpack, esbuild, Rollup)

```jsonc
{
  "compilerOptions": {
    "module": "preserve",
    "moduleResolution": "bundler",
    "noEmit": true
  }
}
```

Use `"module": "preserve"` with `"moduleResolution": "bundler"` when a build tool handles module transformation. TypeScript acts as a type-checker only.

- Allows flexible import paths (with or without file extensions)
- Assumes bundler handles package.json exports/imports
- Used for frontend apps and any code processed by a bundler

### Libraries & Node.js Apps

```jsonc
{
  "compilerOptions": {
    "module": "NodeNext"
  }
}
```

Use `"module": "NodeNext"` when TypeScript is your compiler. Required for:
- npm packages (libraries)
- Node.js apps (including those using Bun or other runtimes)
- CLI tools

This enforces Node.js module resolution rules:
- Requires `.js` file extensions in relative imports
- Respects package.json `"type"` and `"exports"` fields
- Works with both ESM and CommonJS

**Additional library settings:**
```jsonc
{
  "compilerOptions": {
    "declaration": true,
    "composite": true,      // monorepos only
    "declarationMap": true  // monorepos only
  }
}
```

**Rule of thumb:** Build tool compiling your code? Use `preserve` + `bundler`. TypeScript compiling your code? Use `NodeNext`.
