---
title: Service `use` pattern
description: "Wrapping third-party libraries in Effect services"
order: 14
draft: true
---

# Service `use` pattern (Draft)

When integrating third-party libraries into Effect applications, you often need to wrap Promise-based APIs while preserving interruption support and type-safe error handling. The `use` pattern provides a callback-based approach that keeps the underlying client encapsulated while giving consumers full access to its capabilities.

## When to use this pattern

Use the `use` pattern when wrapping libraries that:

- Expose Promise-based APIs with many methods
- Support `AbortSignal` for cancellation
- Don't have native Effect wrappers

Examples: Prisma, Drizzle, AWS SDK, Google Cloud APIs, Supabase, or Node.js built-in modules like `fs/promises`.

For libraries with only a few methods, consider wrapping each method individually with `Effect.tryPromise` instead.

## The pattern

```typescript
import { Effect, Layer, Schema } from "effect"
import * as Context from "effect/Context"
import * as fs_ from "node:fs/promises"

class FileSystemError extends Schema.TaggedErrorClass<FileSystemError>()(
  "FileSystemError",
  { cause: Schema.optional(Schema.Unknown) }
) {}

class FileSystem extends Context.Service<FileSystem, {
  readonly use: <A>(
    fn: (fs: typeof fs_, signal: AbortSignal) => Promise<A>
  ) => Effect.Effect<A, FileSystemError>
}>()("FileSystem") {
  static readonly Default = Layer.effect(
    FileSystem,
    Effect.gen(function* () {
      const use = <A>(
        fn: (fs: typeof fs_, signal: AbortSignal) => Promise<A>
      ): Effect.Effect<A, FileSystemError> =>
        Effect.tryPromise({
          try: (signal) => fn(fs_, signal),
          catch: (cause) => new FileSystemError({ cause }),
        })

      return { use } as const
    }),
  )
}
```

The service exposes a single `use` method that:

1. Accepts a callback receiving the underlying module and an `AbortSignal`
2. Wraps the Promise result in an Effect
3. Converts any thrown errors to `FileSystemError`

## Usage

```typescript
import { Effect, pipe } from "effect"
// hide-start
import { Layer, Schema } from "effect"
import * as Context from "effect/Context"
import * as fs_ from "node:fs/promises"
class FileSystemError extends Schema.TaggedErrorClass<FileSystemError>()(
  "FileSystemError",
  { cause: Schema.optional(Schema.Unknown) }
) {}
class FileSystem extends Context.Service<FileSystem, {
  readonly use: <A>(fn: (fs: typeof fs_, signal: AbortSignal) => Promise<A>) => Effect.Effect<A, FileSystemError>
}>()("FileSystem") {
  static readonly Default = Layer.effect(FileSystem, Effect.succeed({
    use: <A>(fn: (fs: typeof fs_, signal: AbortSignal) => Promise<A>) =>
      Effect.tryPromise({
        try: (signal) => fn(fs_, signal),
        catch: (cause) => new FileSystemError({ cause }),
      }),
  }))
}
// hide-end

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem

  // Read a file
  const content = yield* fileSystem.use((fs, signal) =>
    fs.readFile("config.json", { encoding: "utf-8", signal })
  )

  // Write a file
  yield* fileSystem.use((fs, signal) =>
    fs.writeFile("output.txt", content, { signal })
  )

  // List directory contents
  const files = yield* fileSystem.use((fs) =>
    fs.readdir("./src")
  )

  return files
})

const main = pipe(program, Effect.provide(FileSystem.Default))
```

The callback receives two parameters:

- **fs**: The underlying `fs/promises` module
- **signal**: `AbortSignal` for interruption support

When the Effect is interrupted, the signal is aborted, allowing operations that support cancellation to clean up properly.

## Adding convenience methods

For frequently used operations, add typed methods alongside `use`:

```typescript
import { Effect, Layer, Schema } from "effect"
import * as Context from "effect/Context"
import * as fs_ from "node:fs/promises"

class FileSystemError extends Schema.TaggedErrorClass<FileSystemError>()(
  "FileSystemError",
  { cause: Schema.optional(Schema.Unknown) }
) {}

class FileSystem extends Context.Service<FileSystem, {
  readonly use: <A>(fn: (fs: typeof fs_, signal: AbortSignal) => Promise<A>) => Effect.Effect<A, FileSystemError>
  readonly readFile: (path: string) => Effect.Effect<string, FileSystemError>
  readonly writeFile: (path: string, content: string) => Effect.Effect<void, FileSystemError>
  readonly readdir: (path: string) => Effect.Effect<string[], FileSystemError>
}>()("FileSystem") {
  static readonly Default = Layer.effect(
    FileSystem,
    Effect.gen(function* () {
      const use = <A>(
        fn: (fs: typeof fs_, signal: AbortSignal) => Promise<A>
      ): Effect.Effect<A, FileSystemError> =>
        Effect.tryPromise({
          try: (signal) => fn(fs_, signal),
          catch: (cause) => new FileSystemError({ cause }),
        })

      // Convenience methods for common operations
      const readFile = (path: string) =>
        use((fs, signal) => fs.readFile(path, { encoding: "utf-8", signal }))

      const writeFile = (path: string, content: string) =>
        use((fs, signal) => fs.writeFile(path, content, { signal }))

      const readdir = (path: string) =>
        use((fs) => fs.readdir(path))

      return { use, readFile, writeFile, readdir } as const
    }),
  )
}
```

This gives consumers a choice: use the typed convenience methods for common operations, or use `use` for anything else.

## Why use a callback?

You could expose the underlying client directly, but the callback approach provides:

1. **Automatic error wrapping**: All errors become `FileSystemError` (or your tagged error)
2. **Interruption support**: The abort signal is threaded through automatically
3. **Consistent API**: Every operation goes through the same error handling
4. **Encapsulation**: Consumers can't accidentally use the client outside Effect context

### Exposing the client directly (alternative)

If you prefer direct access, you can expose both:

```typescript
import { Effect, Layer, Schema } from "effect"
import * as Context from "effect/Context"
import * as fs_ from "node:fs/promises"

class FileSystemError extends Schema.TaggedErrorClass<FileSystemError>()(
  "FileSystemError",
  { cause: Schema.optional(Schema.Unknown) }
) {}

class FileSystem extends Context.Service<FileSystem, {
  readonly client: typeof fs_
  readonly use: <A>(fn: (fs: typeof fs_, signal: AbortSignal) => Promise<A>) => Effect.Effect<A, FileSystemError>
}>()("FileSystem") {
  static readonly Default = Layer.effect(
    FileSystem,
    Effect.gen(function* () {
      const use = <A>(
        fn: (fs: typeof fs_, signal: AbortSignal) => Promise<A>
      ): Effect.Effect<A, FileSystemError> =>
        Effect.tryPromise({
          try: (signal) => fn(fs_, signal),
          catch: (cause) => new FileSystemError({ cause }),
        })

      // Expose both for flexibility
      return { client: fs_, use } as const
    }),
  )
}
```

The trade-off is direct client access loses automatic error wrapping and interruption support, so callers must handle these manually.

## Testing

Create a test layer that uses in-memory storage:

```typescript
import { Effect, Layer, Schema } from "effect"
import * as Context from "effect/Context"
import * as fs_ from "node:fs/promises"

class FileSystemError extends Schema.TaggedErrorClass<FileSystemError>()(
  "FileSystemError",
  { cause: Schema.optional(Schema.Unknown) }
) {}

class FileSystem extends Context.Service<FileSystem, {
  readonly use: <A>(fn: (fs: typeof fs_, signal: AbortSignal) => Promise<A>) => Effect.Effect<A, FileSystemError>
}>()("FileSystem") {
  static readonly Default = Layer.effect(
    FileSystem,
    Effect.gen(function* () {
      const use = <A>(
        fn: (fs: typeof fs_, signal: AbortSignal) => Promise<A>
      ): Effect.Effect<A, FileSystemError> =>
        Effect.tryPromise({
          try: (signal) => fn(fs_, signal),
          catch: (cause) => new FileSystemError({ cause }),
        })

      return { use } as const
    }),
  )

  static readonly Test = Layer.succeed(FileSystem, {
    use: <A>(fn: (fs: typeof fs_, signal: AbortSignal) => Promise<A>) => {
      const files = new Map<string, string>([
        ["config.json", '{"port": 3000}'],
        ["data.txt", "hello world"],
      ])

      const mockFs = {
        readFile: async (path: string) => {
          const content = files.get(path)
          if (!content) throw new Error(`ENOENT: ${path}`)
          return content
        },
        writeFile: async (path: string, content: string) => {
          files.set(path, content)
        },
        readdir: async () => Array.from(files.keys()),
      }

      return Effect.tryPromise({
        try: (signal) => fn(mockFs as typeof fs_, signal),
        catch: (cause) => new FileSystemError({ cause }),
      })
    },
  })
}
```

See [Testing with Vitest](./08-testing.md) for more testing patterns.

## Related

- [Error Handling](./06-error-handling.md) for `Schema.TaggedErrorClass` and `Schema.Defect`
- [Services & Layers](./04-services-and-layers.md) for `Context.Service` and layer composition
- [Config](./07-config.md) for loading configuration in services
