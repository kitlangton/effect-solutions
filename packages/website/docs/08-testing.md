---
title: Testing
description: "How to test Effect code with @effect/vitest"
order: 8
---

# Testing

`@effect/vitest` provides enhanced testing support for Effect code. It handles Effect execution, scoped resources, layers, and provides detailed fiber failure reporting.

## Why @effect/vitest?

- **Native Effect support**: Run Effect programs directly in tests with `it.effect()`
- **Automatic cleanup**: `it.scoped()` manages resource lifecycles
- **Test services**: Use TestClock, TestRandom for deterministic tests
- **Better errors**: Full fiber dumps with causes, spans, and logs
- **Layer support**: Provide dependencies to tests with `Effect.provide()`

## Install

```bash
bun add -D vitest @effect/vitest
```

## Setup

Update your test script to use vitest (not `bun test`):

```json
// package.json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Create a `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
})
```

## Basic Testing

Import test functions and assertions from `@effect/vitest`:

```typescript
import { Effect } from "effect"
import { describe, expect, it } from "@effect/vitest"

describe("Calculator", () => {
  // Sync test - regular function
  it("creates instances", () => {
    const result = 1 + 1
    expect(result).toBe(2)
  })

  // Effect test - returns Effect
  it.effect("adds numbers", () =>
    Effect.gen(function* () {
      const result = yield* Effect.succeed(1 + 1)
      expect(result).toBe(2)
    })
  )
})
```

## Test Function Variants

### it.effect()

For tests that return Effect values (most common):

```typescript
import { Effect } from "effect"

const processData = (input: string) => Effect.succeed("expected")

it.effect("processes data", () =>
  Effect.gen(function* () {
    const result = yield* processData("input")
    expect(result).toBe("expected")
  })
)
```

### it.scoped()

For tests using scoped resources. The scope closes automatically when the test ends, triggering cleanup finalizers:

```typescript
import { FileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { Effect } from "effect"

it.scoped("temp directory is cleaned up", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem

    // makeTempDirectoryScoped creates a directory that's deleted when scope closes
    const tempDir = yield* fs.makeTempDirectoryScoped()

    // Use the temp directory
    yield* fs.writeFileString(`${tempDir}/test.txt`, "hello")
    const exists = yield* fs.exists(`${tempDir}/test.txt`)
    expect(exists).toBe(true)

    // When test ends, scope closes and tempDir is deleted
  }).pipe(Effect.provide(NodeFileSystem.layer))
)
```

### it.live()

For tests using real time (no TestClock). Use when you need actual delays or real clock behavior:

```typescript
import { Clock, Effect } from "effect"

// it.effect provides TestContext - clock starts at 0
it.effect("test clock starts at zero", () =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    expect(now).toBe(0)
  })
)

// it.live uses real system clock
it.live("real clock", () =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    expect(now).toBeGreaterThan(0) // Actual system time
  })
)
```

### Using TestClock

`it.effect` automatically provides TestContext with TestClock. Use `TestClock.adjust` to simulate time:

```typescript
import { Effect, Fiber, TestClock } from "effect"

it.effect("time-based test", () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.delay(Effect.succeed("done"), "10 seconds").pipe(
      Effect.fork
    )
    yield* TestClock.adjust("10 seconds")
    const result = yield* Fiber.join(fiber)
    expect(result).toBe("done")
  })
)
```

## Providing Layers

Use `Effect.provide()` inline for test-specific layers:

```typescript
import { Context, Effect, Layer } from "effect"

class Database extends Context.Tag("Database")<
  Database,
  { query: (sql: string) => Effect.Effect<string[]> }
>() {}

const testDatabase = Layer.succeed(Database, {
  query: (_sql) => Effect.succeed(["mock", "data"])
})

it.effect("queries database", () =>
  Effect.gen(function* () {
    const db = yield* Database
    const results = yield* db.query("SELECT * FROM users")
    expect(results.length).toBe(2)
  }).pipe(Effect.provide(testDatabase))
)
```

## Test Modifiers

### Skipping Tests

Use `it.effect.skip` to temporarily disable a test:

```typescript
it.effect.skip("temporarily disabled", () =>
  Effect.gen(function* () {
    // This test won't run
  })
)
```

### Running a Single Test

Use `it.effect.only` to run just one test:

```typescript
it.effect.only("focus on this test", () =>
  Effect.gen(function* () {
    // Only this test runs
  })
)
```

### Expecting Tests to Fail

Use `it.effect.fails` to assert that a test should fail. Useful for documenting known issues:

```typescript
it.effect.fails("known bug", () =>
  Effect.gen(function* () {
    // This test is expected to fail
    expect(1 + 1).toBe(3)
  })
)
```

## Logging

By default, `it.effect` suppresses log output. To enable logging:

```typescript
import { Effect, Logger } from "effect"

// Option 1: Provide a logger
it.effect("with logging", () =>
  Effect.gen(function* () {
    yield* Effect.log("This will be shown")
  }).pipe(Effect.provide(Logger.pretty))
)

// Option 2: Use it.live (logging enabled by default)
it.live("live with logging", () =>
  Effect.gen(function* () {
    yield* Effect.log("This will be shown")
  })
)
```

## Worked Example: Testing a Service

Here's a complete example testing the `Events` service from the [Services & Layers](/services-and-layers#service-driven-development) guide. The service orchestrates `Users`, `Tickets`, and `Emails` to register users for events.

First, define domain types and services with test layers built-in:

```typescript
import { Clock, Context, Effect, Layer, Schema } from "effect"
import { describe, expect, it } from "@effect/vitest"

// Domain types
const RegistrationId = Schema.String.pipe(Schema.brand("RegistrationId"))
type RegistrationId = typeof RegistrationId.Type

const EventId = Schema.String.pipe(Schema.brand("EventId"))
type EventId = typeof EventId.Type

const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

const TicketId = Schema.String.pipe(Schema.brand("TicketId"))
type TicketId = typeof TicketId.Type

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

class Email extends Schema.Class<Email>("Email")({
  to: Schema.String,
  subject: Schema.String,
  body: Schema.String,
}) {}

class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", {
  id: UserId,
}) {}

// Users service with test layer that has create + findById
class Users extends Context.Tag("@app/Users")<
  Users,
  {
    readonly create: (user: User) => Effect.Effect<void>
    readonly findById: (id: UserId) => Effect.Effect<User, UserNotFound>
  }
>() {
  // Mutable state is fine in tests - JS is single-threaded
  static readonly testLayer = Layer.sync(Users, () => {
    const store = new Map<UserId, User>()

    const create = (user: User) => Effect.sync(() => void store.set(user.id, user))

    const findById = (id: UserId) =>
      Effect.fromNullable(store.get(id)).pipe(
        Effect.orElseFail(() => UserNotFound.make({ id }))
      )

    return Users.of({ create, findById })
  })
}

// Tickets service with test layer
class Tickets extends Context.Tag("@app/Tickets")<
  Tickets,
  { readonly issue: (eventId: EventId, userId: UserId) => Effect.Effect<Ticket> }
>() {
  static readonly testLayer = Layer.sync(Tickets, () => {
    let counter = 0

    const issue = (eventId: EventId, _userId: UserId) =>
      Effect.sync(() =>
        Ticket.make({
          id: TicketId.make(`ticket-${counter++}`),
          eventId,
          code: `CODE-${counter}`,
        })
      )

    return Tickets.of({ issue })
  })
}

// Emails service with test layer that tracks sent emails
class Emails extends Context.Tag("@app/Emails")<
  Emails,
  {
    readonly send: (email: Email) => Effect.Effect<void>
    readonly sent: Effect.Effect<ReadonlyArray<Email>>
  }
>() {
  static readonly testLayer = Layer.sync(Emails, () => {
    const emails: Array<Email> = []

    const send = (email: Email) => Effect.sync(() => void emails.push(email))

    const sent = Effect.sync(() => emails)

    return Emails.of({ send, sent })
  })
}
```

The Events service orchestrates the leaf services:

```typescript
class Events extends Context.Tag("@app/Events")<
  Events,
  { readonly register: (eventId: EventId, userId: UserId) => Effect.Effect<Registration, UserNotFound> }
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
          Email.make({
            to: user.email,
            subject: "Event Registration Confirmed",
            body: `Your ticket code: ${ticket.code}`,
          })
        )

        return registration
      }
    )

    return Events.of({ register })
  }).pipe(Layer.effect(Events))
}
```

Compose test layers and write tests:

```typescript
// provideMerge exposes leaf services in tests for setup/assertions
const testLayer = Events.layer.pipe(
  Layer.provideMerge(Users.testLayer),
  Layer.provideMerge(Tickets.testLayer),
  Layer.provideMerge(Emails.testLayer)
)

describe("Events.register", () => {
  it.effect("creates registration with correct data", () =>
    Effect.gen(function* () {
      const users = yield* Users
      const events = yield* Events

      // Arrange: create a user
      const user = User.make({
        id: UserId.make("user-123"),
        name: "Alice",
        email: "alice@example.com",
      })
      yield* users.create(user)

      // Act
      const eventId = EventId.make("event-789")
      const registration = yield* events.register(eventId, user.id)

      // Assert
      expect(registration.eventId).toBe(eventId)
      expect(registration.userId).toBe(user.id)
    }).pipe(Effect.provide(testLayer))
  )

  it.effect("sends confirmation email with ticket code", () =>
    Effect.gen(function* () {
      const users = yield* Users
      const events = yield* Events
      const emails = yield* Emails

      // Arrange
      const user = User.make({
        id: UserId.make("user-456"),
        name: "Bob",
        email: "bob@example.com",
      })
      yield* users.create(user)

      // Act
      yield* events.register(EventId.make("event-789"), user.id)

      // Assert: check sent emails
      const sentEmails = yield* emails.sent
      expect(sentEmails).toHaveLength(1)
      expect(sentEmails[0].to).toBe("bob@example.com")
      expect(sentEmails[0].subject).toBe("Event Registration Confirmed")
      expect(sentEmails[0].body).toContain("CODE-")
    }).pipe(Effect.provide(testLayer))
  )
})
```

## Running Tests

Run tests with vitest:

```bash
# Run all tests
bun run test

# Watch mode
bun run test:watch

# Run specific file
bunx vitest run tests/user.test.ts

# Run tests matching pattern
bunx vitest run -t "UserService"
```

## Next Steps

- Use [TestClock](https://effect.website/docs/guides/testing/test-clock) for time-dependent tests
- Use [TestRandom](https://effect.website/docs/guides/testing/test-random) for deterministic randomness
- See [Testing documentation](https://effect.website/docs/guides/testing/introduction) for advanced patterns
