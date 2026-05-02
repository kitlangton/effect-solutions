---
title: Config
description: "Effect Config usage, providers, and layer patterns"
order: 7
---

# Config

Effect's `Config` module provides type-safe configuration loading with validation, defaults, and transformations.

## How Config Works

By default, Effect loads config from **environment variables**. However, you can provide different config sources using `ConfigProvider`:

- **Production:** Load from environment variables (default)
- **Tests:** Load from in-memory maps
- **Development:** Load from JSON files or hardcoded values

This is controlled via `ConfigProvider.layer`.

## Basic Usage

By default, `Config` reads from environment variables:

```typescript
import { Config, Effect } from "effect"

const program = Effect.gen(function* () {
  // Reads from process.env.API_KEY and process.env.PORT
  const apiKey = yield* Config.redacted("API_KEY")
  const port = yield* Config.int("PORT")

  console.log(`Starting server on port ${port}`)
  // apiKey is redacted in logs
})

// Run with default provider (environment variables)
Effect.runPromise(program)
```

You can override the default provider for tests or different environments:

```typescript
import { Config, ConfigProvider, Effect, Layer } from "effect"

const program = Effect.gen(function* () {
  const apiKey = yield* Config.redacted("API_KEY")
  const port = yield* Config.int("PORT")
  console.log(`Starting server on port ${port}`)
})

// Use a different config source
const testConfigProvider = ConfigProvider.fromUnknown({
  API_KEY: "test-key-123",
  PORT: "3000",
})

// Apply the provider
const testConfigLayer = ConfigProvider.layer(testConfigProvider)

// Run with test config
Effect.runPromise(program.pipe(Effect.provide(testConfigLayer)))
```

## Recommended Pattern: Config Layers

**Best practice:** Create a config service with a `layer` export:

```typescript
import { Config, Effect, Layer, Redacted } from "effect"
import * as Context from "effect/Context"

class ApiConfig extends Context.Service<
  ApiConfig,
  {
    readonly apiKey: Redacted.Redacted
    readonly baseUrl: string
    readonly timeout: number
  }
>()("@app/ApiConfig") {
  static readonly layer = Layer.effect(
    ApiConfig,
    Effect.gen(function* () {
      const apiKey = yield* Config.redacted("API_KEY")
      const baseUrl = yield* Config.string("API_BASE_URL").pipe(
        Config.orElse(() => Config.succeed("https://api.example.com"))
      )
      const timeout = yield* Config.int("API_TIMEOUT").pipe(
        Config.orElse(() => Config.succeed(30000))
      )

      return { apiKey, baseUrl, timeout }
    })
  )

  // For tests - hardcoded values
  static readonly testLayer = Layer.succeed(
    ApiConfig,
    {
      apiKey: Redacted.make("test-key"),
      baseUrl: "https://test.example.com",
      timeout: 5000,
    }
  )
}
```

**Why this pattern?**
- Separates config loading from business logic
- Easy to swap implementations (layer vs testLayer)
- Config errors caught early at layer composition
- Type-safe throughout your app

## Config Primitives

```typescript
import { Config, Schema } from "effect"

// Strings
Config.string("MY_VAR")

// Numbers
Config.number("PORT")
Config.int("MAX_RETRIES")

// Booleans
Config.boolean("DEBUG")

// Sensitive values (redacted in logs)
Config.redacted("API_KEY")

// URLs
Config.url("API_URL")

// Durations
Config.duration("TIMEOUT")

// Env vars are strings, so parse comma-separated values yourself
Config.string("TAGS").pipe(
  Config.map((value) =>
    value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
  )
)

// Structured providers can expose actual arrays
Config.schema(Schema.Array(Schema.String), "TAGS")
```

## Defaults and Fallbacks

```typescript
import { Config, Effect } from "effect"

const program = Effect.gen(function* () {
  // With orElse
  const port = yield* Config.int("PORT").pipe(
    Config.orElse(() => Config.succeed(3000))
  )

  // Optional values
  const optionalKey = yield* Config.option(Config.string("OPTIONAL_KEY"))
  // Returns Option<string>

  return { port, optionalKey }
})
```

## Validation with Schema

**Recommended:** Use `Config.schema` for validation instead of `Config.mapOrFail`:

```typescript
import { Config, Effect, Schema } from "effect"

// Define schemas with built-in validation
const Port = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt()),
  Schema.check(Schema.isBetween({minimum: 1, maximum: 65535}))
)
const Environment = Schema.Literals(["development", "staging", "production"])

const program = Effect.gen(function* () {
  // Schema handles validation automatically
  const port = yield* Config.schema(Port, "PORT")
  const env = yield* Config.schema(Environment, "ENV")

  return { port, env }
})
```

**Config.schema benefits:**

- Automatic type inference from schema
- Rich validation errors with schema messages
- Reusable schemas across config and runtime validation
- Full Schema transformation power (brands, transforms, refinements)

**Example with branded types:**

```typescript
import { Config, Effect, Schema } from "effect"

const Port = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt()),
  Schema.check(Schema.isBetween({minimum: 1, maximum: 65535})),
  Schema.brand("Port")
)
type Port = typeof Port.Type

const program = Effect.gen(function* () {
  const port = yield* Config.schema(Port, "PORT")
  // port is branded as Port, preventing misuse
  return port
})
```

## Manual Validation (Alternative)

You can use `Config.mapOrFail` if you need custom validation without Schema:

```typescript
import { Config, ConfigProvider, Effect } from "effect"

const program = Effect.gen(function* () {
  const port = yield* Config.int("PORT").pipe(
    Config.mapOrFail((p) =>
      p > 0 && p < 65536
        ? Effect.succeed(p)
        : Effect.fail(new Config.ConfigError(new ConfigProvider.SourceError({ message: "Port must be 1-65535" })))
    )
  )

  return port
})
```

## Config Providers

Override where config is loaded from using `ConfigProvider.layer`:

```typescript
import { ConfigProvider, Effect, Layer } from "effect"

const program = Effect.void

const testConfigLayer = ConfigProvider.layer(
  ConfigProvider.fromUnknown({
    API_KEY: "test-key",
    PORT: "3000",
  })
)

const jsonConfigLayer = ConfigProvider.layer(
  ConfigProvider.fromUnknown({
    API_KEY: "prod-key",
    PORT: 8080,
  })
)

const prefixedConfigLayer = ConfigProvider.layer(
  ConfigProvider.fromEnv().pipe(
    ConfigProvider.nested("APP") // Reads APP_API_KEY, APP_PORT, etc.
  )
)

// Usage: provide whichever layer matches the environment
Effect.runPromise(program.pipe(Effect.provide(testConfigLayer)))
```

## Usage in Tests

**Best practice:** Just provide a layer with test values directly. No need for `ConfigProvider.fromMap`:

```typescript
import { Config, Effect, Layer, Redacted } from "effect"
import * as Context from "effect/Context"

class ApiConfig extends Context.Service<
  ApiConfig,
  {
    readonly apiKey: Redacted.Redacted
    readonly baseUrl: string
  }
>()("@app/ApiConfig") {
  static readonly layer = Layer.effect(
    ApiConfig,
    Effect.gen(function* () {
      const apiKey = yield* Config.redacted("API_KEY")
      const baseUrl = yield* Config.string("API_BASE_URL")
      return { apiKey, baseUrl }
    })
  )
}

const program = Effect.gen(function* () {
  const config = yield* ApiConfig
  console.log(config.baseUrl)
})

// Production: reads from environment variables
Effect.runPromise(program.pipe(Effect.provide(ApiConfig.layer)))

// Tests: inline test values as needed
Effect.runPromise(
  program.pipe(
    Effect.provide(
      Layer.succeed(ApiConfig, {
        apiKey: Redacted.make("test-key"),
        baseUrl: "https://test.example.com"
      })
    )
  )
)

// Different test with different values
Effect.runPromise(
  program.pipe(
    Effect.provide(
      Layer.succeed(ApiConfig, {
        apiKey: Redacted.make("another-key"),
        baseUrl: "https://staging.example.com"
      })
    )
  )
)
```

**Why this works:**

- Your production code depends on `ApiConfig` service, not on `Config` primitives
- In tests, provide values directly with `Layer.succeed()`
- No need to mock environment variables or config providers
- Each test can use different values without predefined test layers

## Using Redacted for Secrets

Always use `Config.redacted()` for sensitive values:

```typescript
import { Config, Effect, Redacted } from "effect"

const program = Effect.gen(function* () {
  const apiKey = yield* Config.redacted("API_KEY")

  // Use Redacted.value() to extract
  const headers = {
    Authorization: `Bearer ${Redacted.value(apiKey)}`
  }

  // Redacted values are hidden in logs
  console.log(apiKey) // Output: <redacted>

  return headers
})
```

## Best Practices

1. **Always validate:** Use `mapOrFail` for critical config values
2. **Use defaults wisely:** Provide sensible defaults for non-critical settings
3. **Redact secrets:** Use `Config.redacted()` for tokens, passwords, API keys
4. **Group related config:** Use `Config.nested()` for prefixed environment variables
5. **Type safety:** Let Effect infer types from your Config declarations
6. **Layer composition:** Create config layers with `Layer.effect()` and static `layer` properties

## Example: Database Config Layer

```typescript
import { Config, Effect, Layer, Redacted, Schema } from "effect"
import * as Context from "effect/Context"

const Port = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt()),
  Schema.check(Schema.isBetween({minimum: 1, maximum: 65535}))
)

class DatabaseConfig extends Context.Service<
  DatabaseConfig,
  {
    readonly host: string
    readonly port: number
    readonly database: string
    readonly password: Redacted.Redacted
  }
>()("@app/DatabaseConfig") {
  static readonly layer = Layer.effect(
    DatabaseConfig,
    Effect.gen(function* () {
      const host = yield* Config.schema(Schema.String, "DB_HOST")
      const port = yield* Config.schema(Port, "DB_PORT")
      const database = yield* Config.schema(Schema.String, "DB_NAME")
      const password = yield* Config.schema(Schema.Redacted(Schema.String), "DB_PASSWORD")

      return { host, port, database, password }
    })
  )
}
```
