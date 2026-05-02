---
title: Data Modeling
description: "Records, variants, brands, pattern matching, and JSON serialization"
order: 5
---

# Data Modeling

TypeScript's built-in tools for modeling data are limited. Effect's `Schema` library provides a robust alternative with runtime validation, serialization, and type safety built in.

## Why Schema?

- **Single source of truth**: define once, get TypeScript types + runtime validation + JSON serialization + auto-generated tooling.
- **Parse safely**: validate HTTP/CLI/config data with detailed errors—catch bad data before it crashes your app.
- **Rich domain types**: branded primitives prevent confusion; classes add methods and behavior.
- **Ecosystem integration**: use the same schema everywhere—RPC, HttpApi, CLI, frontend, backend.

## Foundations

All representable data is composed of two primitives:

- **Records** (AND): a `User` has a name AND an email AND a createdAt
- **Variants** (OR): a `Result` is a Success OR a Failure

If you come from a functional programming background, records are product types and variants are sum types.

Schema gives you tools for both, plus runtime validation and serialization.

## Records (AND Types)

Use `Schema.Class` for composite data models with multiple fields:

```typescript
import { Schema } from "effect"

const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

export class User extends Schema.Class<User>("User")({
  id: UserId,
  name: Schema.String,
  email: Schema.String,
  createdAt: Schema.Date,
}) {
  // Add custom getters and methods to extend functionality
  get displayName() {
    return `${this.name} (${this.email})`
  }
}

// Usage
const user = new User({
  id: UserId.make("user-123"),
  name: "Alice",
  email: "alice@example.com",
  createdAt: new Date(),
})

console.log(user.displayName) // "Alice (alice@example.com)"
```

## Variants (OR Types)

Use `Schema.Literal` for simple string or number alternatives:

```typescript
import { Schema } from "effect"

const Status = Schema.Literals(["pending", "active", "completed"])
type Status = typeof Status.Type // "pending" | "active" | "completed"
```

For structured variants with fields, combine `Schema.TaggedClass` with `Schema.Union`:

```typescript
import { Match, Schema } from "effect"

// Define variants with a tag field
export class Success extends Schema.TaggedClass<Success>("Success")("Success", {
  value: Schema.Number,
}) {}

export class Failure extends Schema.TaggedClass<Failure>("Failure")("Failure", {
  error: Schema.String,
}) {}

// Create the union
export const Result = Schema.Union([Success, Failure])
export type Result = typeof Result.Type

// Pattern match with Match.value
const success = new Success({ value: 42 })
const failure = new Failure({ error: "oops" })

const renderResult = (result: Result) =>
  Match.value(result).pipe(
    Match.tag("Success", ({ value }) => `Got: ${value}`),
    Match.tag("Failure", ({ error }) => `Error: ${error}`),
    Match.exhaustive,
  )

renderResult(success) // "Got: 42"
renderResult(failure) // "Error: oops"
```

**Benefits:**

- Type-safe exhaustive matching
- Compiler ensures all cases handled
- No possibility of invalid states

## Branded Types

Use branded types to prevent mixing values that have the same underlying type. **In a well-designed domain model, nearly all primitives should be branded**. Not just IDs, but emails, URLs, timestamps, slugs, counts, percentages, and any value with semantic meaning.

```typescript
import { Schema } from "effect"

// IDs - prevent mixing different entity IDs
export const UserId = Schema.String.pipe(Schema.brand("UserId"))
export type UserId = typeof UserId.Type

export const PostId = Schema.String.pipe(Schema.brand("PostId"))
export type PostId = typeof PostId.Type

// Domain primitives - create a rich type system
export const Email = Schema.String.pipe(Schema.brand("Email"))
export type Email = typeof Email.Type

export const Port = Schema.Int.pipe(Schema.check(Schema.isBetween({minimum: 1, maximum: 65535})), Schema.brand("Port"))
export type Port = typeof Port.Type

// Usage - impossible to mix types
const userId = UserId.make("user-123")
const postId = PostId.make("post-456")
const email = Email.make("alice@example.com")

function getUser(id: UserId) { return id }
function sendEmail(to: Email) { return to }

// This works
getUser(userId)
sendEmail(email)

// All of these produce type errors
// getUser(postId) // Can't pass PostId where UserId expected
// sendEmail(slug) // Can't pass Slug where Email expected
// const bad: UserId = "raw-string" // Can't assign raw string to branded type
```

## JSON Encoding & Decoding

Use `Schema.fromJsonString` to parse JSON strings and validate them with your schema in one step. This combines `JSON.parse` + schema decoding in one step, and `JSON.stringify` + schema encoding for the reverse:

```typescript
import { Effect, Schema } from "effect"

const Row = Schema.Literals(["A", "B", "C", "D", "E", "F", "G", "H"])
const Column = Schema.Literals(["1", "2", "3", "4", "5", "6", "7", "8"])

class Position extends Schema.Class<Position>("Position")({
  row: Row,
  column: Column,
}) {}

class Move extends Schema.Class<Move>("Move")({
  from: Position,
  to: Position,
}) {}

// fromJsonString combines JSON.parse + schema decoding
// MoveFromJson is a schema that takes a JSON string and returns a Move
const MoveFromJson = Schema.fromJsonString(Move)

const program = Effect.gen(function* () {
  // Parse and validate JSON string in one step
  // Use MoveFromJson (not Move) to decode from JSON string
  const jsonString = '{"from":{"row":"A","column":"1"},"to":{"row":"B","column":"2"}}'
  const move = yield* Schema.decodeUnknownEffect(MoveFromJson)(jsonString)

  yield* Effect.log("Decoded move", move)

  // Encode to JSON string in one step (typed as string)
  // Use MoveFromJson (not Move) to encode to JSON string
  const json = yield* Schema.encodeEffect(MoveFromJson)(move)
  return json
})
```
