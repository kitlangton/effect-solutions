---
title: Error Handling
description: "Schema.TaggedError modeling, pattern matching, and defects"
order: 6
---

# Error Handling

Effect provides structured error handling with Schema integration for serializable, type-safe errors.

## Schema.TaggedError

Define domain errors with `Schema.TaggedError`:

```typescript
import { Schema } from "effect"

class ValidationError extends Schema.TaggedErrorClass<ValidationError>()(
  "ValidationError",
  {
    field: Schema.String,
    message: Schema.String,
  }
) {}

class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()(
  "NotFoundError",
  {
    resource: Schema.String,
    id: Schema.String,
  }
) {}

const AppError = Schema.Union([ValidationError, NotFoundError])
type AppError = typeof AppError.Type

// Usage
const error = new ValidationError({
  field: "email",
  message: "Invalid format",
})
```

**Benefits:**

- Serializable (can send over network/save to DB)
- Type-safe
- Built-in `_tag` for pattern matching
- Custom methods via class
- Sensible default `message` when you don't declare one

**Note:** `Schema.TaggedError` values are *yieldable*; you can return them directly in a generator without wrapping them in `Effect.fail`:

```typescript
import { Effect, Random, Schema } from "effect"

class BadLuck extends Schema.TaggedErrorClass<BadLuck>()(
  "BadLuck",
  { roll: Schema.Number }
) {}

const rollDie = Effect.gen(function* () {
  const roll = yield* Random.nextIntBetween(1, 6)
  if (roll === 1) {
    // Yield the tagged error directly; no Effect.fail needed
    yield* new BadLuck({ roll })
  }
  return { roll }
})
```

## Recovering from Errors

Effect provides several functions for recovering from errors. Use these to handle errors and continue program execution.

### catch

Handle all errors by providing a fallback effect:

```typescript
import { Effect, Schema } from "effect"

class HttpError extends Schema.TaggedErrorClass<HttpError>()(
  "HttpError",
  {
    statusCode: Schema.Number,
    message: Schema.String,
  }
) {}

class ValidationError extends Schema.TaggedErrorClass<ValidationError>()(
  "ValidationError",
  {
    message: Schema.String,
  }
) {}

declare const program: Effect.Effect<string, HttpError | ValidationError>

const recovered: Effect.Effect<string, never> = program.pipe(
  Effect.catch((error) =>
    Effect.gen(function* () {
      yield* Effect.logError("Error occurred", error)
      return `Recovered from ${error._tag}`
    })
  )
)
```

### catchTag

Handle specific errors by their `_tag`.

```typescript
import { Effect, Schema } from "effect"

class HttpError extends Schema.TaggedErrorClass<HttpError>()(
  "HttpError",
  {
    statusCode: Schema.Number,
    message: Schema.String,
  }
) {}

class ValidationError extends Schema.TaggedErrorClass<ValidationError>()(
  "ValidationError",
  {
    message: Schema.String,
  }
) {}

const program: Effect.Effect<string, HttpError | ValidationError> =
  Effect.fail(new HttpError({
    statusCode: 500,
    message: "Internal server error",
  }))

const recovered: Effect.Effect<string, ValidationError> = program.pipe(
  Effect.catchTag("HttpError", (error) =>
    Effect.gen(function* () {
      yield* Effect.logWarning(`HTTP ${error.statusCode}: ${error.message}`)
      return "Recovered from HttpError"
    })
  )
)
```

### catchTags

Handle multiple error types at once.

```typescript
import { Effect, Schema } from "effect"

class HttpError extends Schema.TaggedErrorClass<HttpError>()(
  "HttpError",
  {
    statusCode: Schema.Number,
    message: Schema.String,
  }
) {}

class ValidationError extends Schema.TaggedErrorClass<ValidationError>()(
  "ValidationError",
  {
    message: Schema.String,
  }
) {}

const program: Effect.Effect<string, HttpError | ValidationError> =
  Effect.fail(new HttpError({
    statusCode: 500,
    message: "Internal server error",
  }))

const recovered: Effect.Effect<string, never> = program.pipe(
  Effect.catchTags({
    HttpError: () => Effect.succeed("Recovered from HttpError"),
    ValidationError: () => Effect.succeed("Recovered from ValidationError")
  })
)
```

## Expected Errors vs Defects

Effect tracks errors in the type system (`Effect<A, E, R>`) so callers know what can go wrong and can recover. But tracking only matters if recovery is possible. When there's no sensible way to recover, use a defect instead: it terminates the fiber and you handle it once at the system boundary (logging, crash reporting, graceful shutdown).

**Use typed errors** for domain failures the caller can handle: validation errors, "not found", permission denied, rate limits.

**Use defects** for unrecoverable situations: bugs and invariant violations.

```typescript
import { Effect } from "effect"
// hide-start
declare const loadConfig: Effect.Effect<{ port: number }, Error>
// hide-end

// At app entry: if config fails, nothing can proceed
const main = Effect.gen(function* () {
  const config = yield* loadConfig.pipe(Effect.orDie)
  yield* Effect.log(`Starting on port ${config.port}`)
})
```

**When to catch defects:** Almost never. Only at system boundaries for logging/diagnostics. Use `Effect.exit` to inspect or `Effect.catchAllDefect` if you must recover (e.g., plugin sandboxing).

## Schema.Defect - Wrapping Unknown Errors

Use `Schema.Defect` to wrap unknown errors from external libraries.

```typescript
import { Schema, Effect } from "effect"

class ApiError extends Schema.TaggedErrorClass<ApiError>()(
  "ApiError",
  {
    endpoint: Schema.String,
    statusCode: Schema.Number,
    // Wrap the underlying error from fetch/axios/etc
    error: Schema.Defect,
  }
) {}

// Usage - catching errors from external libraries
const fetchUser = (id: string) =>
  Effect.tryPromise({
    try: () => fetch(`/api/users/${id}`).then((r: Response) => r.json()),
    catch: (error) => new ApiError({
      endpoint: `/api/users/${id}`,
      statusCode: 500,
      error
    })
  })
```

**Schema.Defect handles:**

- JavaScript `Error` instances → `{ name, message }` objects
- Any unknown value → string representation
- Serializable for network/storage

**Use for:**

- Wrapping errors from external libraries (fetch, axios, etc)
- Network boundaries (API errors)
- Persisting errors to DB
- Logging systems
