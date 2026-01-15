---
title: Services & Layers
description: "Context.Tag and Layer patterns for dependency injection"
order: 4
---

# Services & Layers

Effect's service pattern provides a deterministic way to organize your application through dependency injection. By defining services as `Context.Tag` classes and composing them into Layers, you create explicit dependency graphs that are type-safe, testable, and modular.

## What is a Service?

A service in Effect is defined using `Context.Tag` as a class that declares:

1. **A unique identifier** (e.g., `@app/Database`)
2. **An interface** that describes the service's methods

Services provide contracts without implementation. The actual behavior comes later through Layers.

```typescript
import { Context, Effect } from "effect"

class Database extends Context.Tag("@app/Database")<
  Database,
  {
    readonly query: (sql: string) => Effect.Effect<unknown[]>
    readonly execute: (sql: string) => Effect.Effect<void>
  }
>() {}

class Logger extends Context.Tag("@app/Logger")<
  Logger,
  {
    readonly log: (message: string) => Effect.Effect<void>
  }
>() {}
```

- **Tag identifiers must be unique**. Use `@path/to/ServiceName` prefix pattern
- **Service methods should have no dependencies (`R = never`)**. Dependencies are handled via Layer composition, not through method signatures
- **Use readonly properties**. Services should not expose mutable state directly

## What is a Layer?

A Layer is an implementation of a service. Layers handle:

1. **Setup/initialization**: Connecting to databases, reading config, etc.
2. **Dependency resolution**: Acquiring other services they need
3. **Resource lifecycle**: Cleanup happens automatically

```typescript
import { HttpClient, HttpClientResponse } from "@effect/platform"
import { Context, Effect, Layer, Schema } from "effect"

const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

class User extends Schema.Class<User>("User")({
  id: UserId,
  name: Schema.String,
  email: Schema.String,
}) {}

class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
  "UserNotFoundError",
  {
    id: UserId,
  }
) {}

class GenericUsersError extends Schema.TaggedError<GenericUsersError>()(
  "GenericUsersError",
  {
    id: UserId,
    error: Schema.Defect,
  }
) {}

const UsersError = Schema.Union(UserNotFoundError, GenericUsersError)
type UsersError = typeof UsersError.Type

class Analytics extends Context.Tag("@app/Analytics")<
  Analytics,
  {
    readonly track: (event: string, data: Record<string, unknown>) => Effect.Effect<void>
  }
>() {}

class Users extends Context.Tag("@app/Users")<
  Users,
  {
    readonly findById: (id: UserId) => Effect.Effect<User, UsersError>
    readonly all: () => Effect.Effect<readonly User[]>
  }
>() {
  static readonly layer = Effect.gen(function* () {
    // 1. yield* services you depend on
    const http = yield* HttpClient.HttpClient
    const analytics = yield* Analytics

    // 2. define the service methods with Effect.fn for call-site tracing
    const findById = Effect.fn("Users.findById")(
      function* (id: UserId) {
        yield* analytics.track("user.find", { id })
        const response = yield* http.get(`https://api.example.com/users/${id}`)
        return yield* HttpClientResponse.schemaBodyJson(User)(response)
      },
      Effect.catchTag("ResponseError", (error) =>
        error.response.status === 404
          ? UserNotFoundError.make({ id })
          : GenericUsersError.make({ id, error }),
      ),
    )

    // Use Effect.fn even for nullary methods (thunks) to enable tracing
    const all = Effect.fn("Users.all")(function* () {
      const response = yield* http.get("https://api.example.com/users")
      return yield* HttpClientResponse.schemaBodyJson(Schema.Array(User))(response)
    })

    // 3. return the service
    return Users.of({ findById, all })
  }).pipe(Layer.effect(Users))
}
```

**Layer naming:** camelCase with `Layer` suffix: `layer`, `testLayer`, `postgresLayer`, `sqliteLayer`, etc.

## Service-Driven Development

Start by sketching leaf service tags (without implementations). This lets you write real TypeScript for higher-level orchestration services that type-checks even though the leaf services aren't runnable yet.

```typescript
import { Clock, Context, Effect, Layer, Schema } from "effect"

// Branded types for IDs
const RegistrationId = Schema.String.pipe(Schema.brand("RegistrationId"))
type RegistrationId = typeof RegistrationId.Type

const EventId = Schema.String.pipe(Schema.brand("EventId"))
type EventId = typeof EventId.Type

const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

const TicketId = Schema.String.pipe(Schema.brand("TicketId"))
type TicketId = typeof TicketId.Type

// Domain models
class User extends Schema.Class<User>("User")({
  id: UserId,
  name: Schema.String,
  email: Schema.String,
}) {}

class Registration extends Schema.Class<Registration>("Registration")({
  id: RegistrationId,
  eventId: EventId,
  userId: UserId,
  ticketId: TicketId,
  registeredAt: Schema.Date,
}) {}

class Ticket extends Schema.Class<Ticket>("Ticket")({
  id: TicketId,
  eventId: EventId,
  code: Schema.String,
}) {}

// Leaf services: contracts only
class Users extends Context.Tag("@app/Users")<
  Users,
  {
    readonly findById: (id: UserId) => Effect.Effect<User>
  }
>() {}

class Tickets extends Context.Tag("@app/Tickets")<
  Tickets,
  {
    readonly issue: (eventId: EventId, userId: UserId) => Effect.Effect<Ticket>
    readonly validate: (ticketId: TicketId) => Effect.Effect<boolean>
  }
>() {}

class Emails extends Context.Tag("@app/Emails")<
  Emails,
  {
    readonly send: (to: string, subject: string, body: string) => Effect.Effect<void>
  }
>() {}

// Higher-level service: orchestrates leaf services
class Events extends Context.Tag("@app/Events")<
  Events,
  {
    readonly register: (eventId: EventId, userId: UserId) => Effect.Effect<Registration>
  }
>() {
  static readonly layer = Effect.gen(function* () {
    const users = yield* Users
    const tickets = yield* Tickets
    const emails = yield* Emails

    const register = Effect.fn("Events.register")(
      function* (eventId: EventId, userId: UserId) {
        const user = yield* users.findById(userId)
        const ticket = yield* tickets.issue(eventId, userId)
        const now = yield* Clock.currentTimeMillis

        const registration = Registration.make({
          id: RegistrationId.make(crypto.randomUUID()),
          eventId,
          userId,
          ticketId: ticket.id,
          registeredAt: new Date(now),
        })

        yield* emails.send(
          user.email,
          "Event Registration Confirmed",
          `Your ticket code: ${ticket.code}`
        )

        return registration
      }
    )

    return Events.of({ register })
  }).pipe(Layer.effect(Events))
}
```

> **Note:** This code won't run yet since Users, Tickets, and Emails lack implementations. But Events orchestration logic is real TypeScript that compiles and lets you model dependencies before writing production layers.

Benefits:

- Leaf service contracts are explicit. Users, Tickets, and Emails return typed data (no parsing needed).
- Higher-level orchestration (Events) coordinates multiple services cleanly.
- Type-checks immediately even though leaf services aren't implemented yet.
- Adding production implementations later doesn't change Events code.

See [Testing with Vitest](./08-testing.md#worked-example-testing-a-service) for a complete worked example testing this `Events` service with test layers.

## Test Implementations

When designing with services first, create lightweight test implementations. Use `Effect.sync` or `Effect.succeed` when your test doesn't need async operations or effects.

```typescript
import { Console, Context, Effect, Layer } from "effect"

class Database extends Context.Tag("@app/Database")<
  Database,
  {
    readonly query: (sql: string) => Effect.Effect<unknown[]>
    readonly execute: (sql: string) => Effect.Effect<void>
  }
>() {
  static readonly testLayer = Layer.sync(Database, () => {
    let records: Record<string, unknown> = {
      "user-1": { id: "user-1", name: "Alice" },
      "user-2": { id: "user-2", name: "Bob" },
    }

    const query = (sql: string) => Effect.succeed(Object.values(records))
    const execute = (sql: string) => Console.log(`Test execute: ${sql}`)

    return Database.of({ query, execute })
  })
}

class Cache extends Context.Tag("@app/Cache")<
  Cache,
  {
    readonly get: (key: string) => Effect.Effect<string | null>
    readonly set: (key: string, value: string) => Effect.Effect<void>
  }
>() {
  static readonly testLayer = Layer.sync(Cache, () => {
    const store = new Map<string, string>()

    const get = (key: string) => Effect.succeed(store.get(key) ?? null)
    const set = (key: string, value: string) => Effect.sync(() => void store.set(key, value))

    return Cache.of({ get, set })
  })
}
```

## Providing Layers to Effects

Use `Effect.provide` once at the top of your application to supply all dependencies. Avoid scattering `provide` calls throughout your codebase.

```typescript
import { Context, Effect, Layer } from "effect"
// hide-start
class Config extends Context.Tag("@app/Config")<Config, { readonly apiKey: string }>() {}
class Logger extends Context.Tag("@app/Logger")<Logger, { readonly info: (msg: string) => Effect.Effect<void> }>() {}
class Database extends Context.Tag("@app/Database")<Database, { readonly query: () => Effect.Effect<void> }>() {}
class UserService extends Context.Tag("@app/UserService")<UserService, { readonly getUser: () => Effect.Effect<void> }>() {}
declare const configLayer: Layer.Layer<Config>
declare const loggerLayer: Layer.Layer<Logger>
declare const databaseLayer: Layer.Layer<Database>
declare const userServiceLayer: Layer.Layer<UserService, never, Database>
// hide-end

// Compose all layers into a single app layer
const appLayer = userServiceLayer.pipe(
  Layer.provideMerge(databaseLayer),
  Layer.provideMerge(loggerLayer),
  Layer.provideMerge(configLayer)
)

// Your program uses services freely
const program = Effect.gen(function* () {
  const users = yield* UserService
  const logger = yield* Logger
  yield* logger.info("Starting...")
  yield* users.getUser()
})

// Provide once at the entry point
const main = program.pipe(Effect.provide(appLayer))

Effect.runPromise(main)
```

**Why provide once at the top?**

- Clear dependency graph: all wiring in one place
- Easier testing: swap `appLayer` for `testLayer`
- No hidden dependencies: effects declare what they need via types
- Simpler refactoring: change wiring without touching business logic

## Layer Memoization

Effect automatically memoizes layers by reference identity. When the same layer instance appears multiple times in your dependency graph, it's constructed only once.

This matters especially for resource-intensive layers like database connection pools. Duplicating a pool means wasted connections and potential connection limit issues:

```typescript
import { Layer } from "effect"
// hide-start
import { Context, Effect } from "effect"
class SqlClient extends Context.Tag("@app/SqlClient")<SqlClient, { readonly query: (sql: string) => Effect.Effect<unknown[]> }>() {}
class Postgres { static layer(_: { readonly url: string; readonly poolSize: number }): Layer.Layer<SqlClient> { return Layer.succeed(SqlClient, { query: () => Effect.succeed([]) }) } }
class UserRepo extends Context.Tag("@app/UserRepo")<UserRepo, {}>() {
  static readonly layer: Layer.Layer<UserRepo, never, SqlClient> = Layer.succeed(UserRepo, {})
}
class OrderRepo extends Context.Tag("@app/OrderRepo")<OrderRepo, {}>() {
  static readonly layer: Layer.Layer<OrderRepo, never, SqlClient> = Layer.succeed(OrderRepo, {})
}
// hide-end

// ❌ Bad: calling the constructor twice creates two connection pools
const badAppLayer = Layer.merge(
  UserRepo.layer.pipe(
    Layer.provide(Postgres.layer({ url: "postgres://localhost/mydb", poolSize: 10 }))
  ),
  OrderRepo.layer.pipe(
    Layer.provide(Postgres.layer({ url: "postgres://localhost/mydb", poolSize: 10 })) // Different reference!
  )
)
// Creates TWO connection pools (20 connections total). Could hit server limits.
```

**The fix:** Store the layer in a constant first:

```typescript
import { Layer } from "effect"
// hide-start
import { Context, Effect } from "effect"
class SqlClient extends Context.Tag("@app/SqlClient")<SqlClient, { readonly query: (sql: string) => Effect.Effect<unknown[]> }>() {}
class Postgres { static layer(_: { readonly url: string; readonly poolSize: number }): Layer.Layer<SqlClient> { return Layer.succeed(SqlClient, { query: () => Effect.succeed([]) }) } }
class UserRepo extends Context.Tag("@app/UserRepo")<UserRepo, {}>() {
  static readonly layer: Layer.Layer<UserRepo, never, SqlClient> = Layer.succeed(UserRepo, {})
}
class OrderRepo extends Context.Tag("@app/OrderRepo")<OrderRepo, {}>() {
  static readonly layer: Layer.Layer<OrderRepo, never, SqlClient> = Layer.succeed(OrderRepo, {})
}
// hide-end

// ✅ Good: store the layer in a constant
const postgresLayer = Postgres.layer({ url: "postgres://localhost/mydb", poolSize: 10 })

const goodAppLayer = Layer.merge(
  UserRepo.layer.pipe(Layer.provide(postgresLayer)),
  OrderRepo.layer.pipe(Layer.provide(postgresLayer)) // Same reference!
)
// Single connection pool (10 connections) shared by both repos
```

**The rule:** When using parameterized layer constructors, always store the result in a module-level constant before using it in multiple places.

## A Note on Effect.Service

Effect also provides [`Effect.Service`](https://effect.website/blog/releases/effect/39/#effectservice), which bundles a Tag and default Layer together. It's useful when you have an obvious default implementation.

We focus on `Context.Tag` here because it supports service-driven development: sketching interfaces before implementations. A future Effect version aims to combine both approaches.

## Sharing Layers Between Tests

By default, provide a fresh layer inside each `it.effect` so state never leaks between tests. Use `it.layer` only when you need to share an expensive resource—like a database connection—across an entire suite. If you're not sure, skip `it.layer`.

`it.layer` constructs the layer once before any tests run and tears it down after all tests complete. This avoids repeated setup costs, but since all tests share the same instance, state can leak between them.

Per-test layering (preferred):

```typescript
import { expect, it } from "@effect/vitest"
import { Context, Effect, Layer } from "effect"

class Counter extends Context.Tag("@app/Counter")<
  Counter,
  { readonly get: () => Effect.Effect<number>; readonly increment: () => Effect.Effect<void> }
>() {
  static readonly layer = Layer.sync(Counter, () => {
    let count = 0
    return Counter.of({
      get: () => Effect.succeed(count),
      increment: () => Effect.sync(() => void count++),
    })
  })
}

// Each test provides the layer, so each gets its own fresh counter
it.effect("starts at zero", () =>
  Effect.gen(function* () {
    const counter = yield* Counter
    expect(yield* counter.get()).toBe(0)
  }).pipe(Effect.provide(Counter.layer)),
)

it.effect("increments without leaking", () =>
  Effect.gen(function* () {
    const counter = yield* Counter
    yield* counter.increment()
    expect(yield* counter.get()).toBe(1)
  }).pipe(Effect.provide(Counter.layer)),
)
```

Suite-shared layering (only when you know you need it):

```typescript
import { expect, it } from "@effect/vitest"
import { Context, Effect, Layer } from "effect"

class Counter extends Context.Tag("@app/Counter")<
  Counter,
  {
    readonly get: () => Effect.Effect<number>
    readonly increment: () => Effect.Effect<void>
  }
>() {
  static readonly layer = Layer.sync(Counter, () => {
    let count = 0
    return Counter.of({
      get: () => Effect.succeed(count),
      increment: () => Effect.sync(() => void count++),
    })
  })
}

it.layer(Counter.layer)("counter", (it) => {
  it.effect("starts at zero", () =>
    Effect.gen(function* () {
      const counter = yield* Counter
      expect(yield* counter.get()).toBe(0)
    })
  )

  it.effect("increments", () =>
    Effect.gen(function* () {
      const counter = yield* Counter
      yield* counter.increment()
      // State persists: the first test already ran, so count was 0, now it's 1
      expect(yield* counter.get()).toBe(1)
    })
  )
})
```
