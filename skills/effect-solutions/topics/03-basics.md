---
title: Basics
description: "Coding conventions for Effect.fn and Effect.gen"
order: 3
---

# Basics

Here are some guidelines for how to structure basic Effect code. How to express sequencing with `Effect.gen`, and when to name effectful functions with `Effect.fn`.

## Effect.gen


Just as `async/await` provides a sequential, readable way to work with `Promise` values (avoiding nested `.then()` chains), `Effect.gen` and `yield*` provide the same ergonomic benefits for `Effect` values. 


```typescript
import { Effect } from "effect"
// hide-start
declare const fetchData: Effect.Effect<string>
declare const processData: (data: string) => Effect.Effect<string>
// hide-end

const program = Effect.gen(function* () {
  const data = yield* fetchData
  yield* Effect.logInfo(`Processing data: ${data}`)
  return yield* processData(data)
})
```

## Effect.fn

Use `Effect.fn` with generator functions for traced, named effects. `Effect.fn` traces where the function is called from, not just where it's defined:

```typescript
import { Effect } from "effect"
// hide-start
interface User {
  id: string
  name: string
}
declare const getUser: (userId: string) => Effect.Effect<User>
declare const processData: (user: User) => Effect.Effect<User>
// hide-end

const processUser = Effect.fn("processUser")(function* (userId: string) {
  yield* Effect.logInfo(`Processing user ${userId}`)
  const user = yield* getUser(userId)
  return yield* processData(user)
})
```

`Effect.fn` also accepts a second argument: a function that transforms the entire effect. This is useful for adding cross-cutting concerns like timeouts without wrapping the body:

```typescript
import { Effect, flow, Schedule } from "effect"
// hide-start
declare const fetchData: (url: string) => Effect.Effect<string>
declare const processData: (data: string) => Effect.Effect<string>
// hide-end

const fetchWithTimeout = Effect.fn("fetchWithTimeout")(
  function* (url: string) {
    const data = yield* fetchData(url)
    return yield* processData(data)
  },
  flow(
    Effect.retry(Schedule.recurs(3)),
    Effect.timeout("5 seconds")
  )
)
```

**Benefits:**

- Call-site tracing for each invocation
- Stack traces with location details
- Clean signatures

**Note:** `Effect.fn` automatically creates spans that integrate with telemetry systems. {/* When using OpenTelemetry, these spans appear in your traces. See [Observability](/observability) for details. */}

## Pipe for Instrumentation

Use `.pipe()` to add cross-cutting concerns to Effect values. Common uses: timeouts, retries, logging, and annotations.

```typescript
import { Effect, Schedule } from "effect"
// hide-start
declare const fetchData: Effect.Effect<string>
// hide-end

const program = fetchData.pipe(
  Effect.timeout("5 seconds"),
  Effect.retry(Schedule.exponential("100 millis").pipe(Schedule.both(Schedule.recurs(3)))),
  Effect.tap((data) => Effect.logInfo(`Fetched: ${data}`)),
  Effect.withSpan("fetchData")
)
```

**Common instrumentation:**

- `Effect.timeout` - fail if effect takes too long
- `Effect.retry` - retry on failure with a schedule
- `Effect.tap` - run side effect without changing the value
- `Effect.withSpan` - add tracing span

## Retry and Timeout

For production code, combine retry and timeout to handle transient failures:

```typescript
import { Effect, Schedule } from "effect"
// hide-start
declare const callExternalApi: Effect.Effect<string>
// hide-end

// Retry with exponential backoff, max 3 attempts
const retryPolicy = Schedule.exponential("100 millis").pipe(
  Schedule.both(Schedule.recurs(3))
)

const resilientCall = callExternalApi.pipe(
  // Timeout each individual attempt
  Effect.timeout("2 seconds"),
  // Retry failed attempts
  Effect.retry(retryPolicy),
  // Overall timeout for all attempts
  Effect.timeout("10 seconds")
)
```

**Schedule combinators:**

- `Schedule.exponential` - exponential backoff
- `Schedule.recurs` - limit number of retries
- `Schedule.spaced` - fixed delay between retries
- `Schedule.both` - combine schedules (both must continue)
