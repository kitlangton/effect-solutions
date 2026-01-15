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

This is controlled via `Layer.setConfigProvider`.

## Basic Usage

By default, `Config` reads from environment variables:

```typescript
import { Config, Effect } from "effect"

const program = Effect.gen(function* () {
  // Reads from process.env.API_KEY and process.env.PORT
  const apiKey = yield* Config.redacted("API_KEY")
  const port = yield* Config.integer("PORT")

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
  const port = yield* Config.integer("PORT")
  console.log(`Starting server on port ${port}`)
})

// Use a different config source
const testConfigProvider = ConfigProvider.fromMap(
  new Map([
    ["API_KEY", "test-key-123"],
    ["PORT", "3000"],
  ])
)

// Apply the provider
const testConfigLayer = Layer.setConfigProvider(testConfigProvider)

// Run with test config
Effect.runPromise(program.pipe(Effect.provide(testConfigLayer)))
```

## Recommended Pattern: Config Layers

**Best practice:** Create a config service with a `layer` export:

```typescript
import { Config, Context, Effect, Layer, Redacted } from "effect"

class ApiConfig extends Context.Tag("@app/ApiConfig")<
  ApiConfig,
  {
    readonly apiKey: Redacted.Redacted
    readonly baseUrl: string
    readonly timeout: number
  }
>() {
  static readonly layer = Effect.gen(function* () {
    const apiKey = yield* Config.redacted("API_KEY")
    const baseUrl = yield* Config.string("API_BASE_URL").pipe(
      Config.orElse(() => Config.succeed("https://api.example.com"))
    )
    const timeout = yield* Config.integer("API_TIMEOUT").pipe(
      Config.orElse(() => Config.succeed(30000))
    )
    return ApiConfig.of({ apiKey, baseUrl, timeout })
  }).pipe(Layer.effect(ApiConfig))

  // For tests - hardcoded values
  static readonly testLayer = Layer.succeed(ApiConfig, {
    apiKey: Redacted.make("test-key"),
    baseUrl: "https://test.example.com",
    timeout: 5000,
  })
}
```

**Why this pattern?**
- Separates config loading from business logic
- Easy to swap implementations (layer vs testLayer)
- Config errors caught early at layer composition
- Type-safe throughout your app

## Config Primitives

```typescript
import { Config } from "effect"

// Strings
Config.string("MY_VAR")

// Numbers
Config.number("PORT")
Config.integer("MAX_RETRIES")

// Booleans
Config.boolean("DEBUG")

// Sensitive values (redacted in logs)
Config.redacted("API_KEY")

// URLs
Config.url("API_URL")

// Durations
Config.duration("TIMEOUT")

// Arrays (comma-separated values in env vars)
Config.array(Config.string(), "TAGS")
```

## Defaults and Fallbacks

```typescript
import { Config, Effect } from "effect"

const program = Effect.gen(function* () {
  // With orElse
  const port = yield* Config.integer("PORT").pipe(
    Config.orElse(() => Config.succeed(3000))
  )

  // Optional values
  const optionalKey = yield* Config.option(Config.string("OPTIONAL_KEY"))
  // Returns Option<string>

  return { port, optionalKey }
})
```

## Validation with Schema

**Recommended:** Use `Schema.Config` for validation instead of `Config.mapOrFail`:

```typescript
import { Config, Effect, Schema } from "effect"

// Define schemas with built-in validation
const Port = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.between(1, 65535)
)
const Environment = Schema.Literal("development", "staging", "production")

const program = Effect.gen(function* () {
  // Schema handles validation automatically
  const port = yield* Schema.Config("PORT", Port)
  const env = yield* Schema.Config("ENV", Environment)

  return { port, env }
})
```

**Schema.Config benefits:**

- Automatic type inference from schema
- Rich validation errors with schema messages
- Reusable schemas across config and runtime validation
- Full Schema transformation power (brands, transforms, refinements)

**Example with branded types:**

```typescript
import { Effect, Schema } from "effect"

const Port = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.between(1, 65535),
  Schema.brand("Port")
)
type Port = typeof Port.Type

const program = Effect.gen(function* () {
  const port = yield* Schema.Config("PORT", Port)
  // port is branded as Port, preventing misuse
  return port
})
```

## Manual Validation (Alternative)

You can use `Config.mapOrFail` if you need custom validation without Schema:

```typescript
import { Config, ConfigError, Effect } from "effect"

const program = Effect.gen(function* () {
  const port = yield* Config.integer("PORT").pipe(
    Config.mapOrFail((p) =>
      p > 0 && p < 65536
        ? Effect.succeed(p)
        : Effect.fail(ConfigError.InvalidData([], "Port must be 1-65535"))
    )
  )

  return port
})
```

## Config Providers

Override where config is loaded from using `Layer.setConfigProvider`:

```typescript
import { ConfigProvider, Effect, Layer } from "effect"

const program = Effect.unit

const testConfigLayer = Layer.setConfigProvider(
  ConfigProvider.fromMap(
    new Map([
      ["API_KEY", "test-key"],
      ["PORT", "3000"],
    ])
  )
)

const jsonConfigLayer = Layer.setConfigProvider(
  ConfigProvider.fromJson({
    API_KEY: "prod-key",
    PORT: 8080,
  })
)

const prefixedConfigLayer = Layer.setConfigProvider(
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
import { Config, Context, Effect, Layer, Redacted } from "effect"

class ApiConfig extends Context.Tag("@app/ApiConfig")<
  ApiConfig,
  {
    readonly apiKey: Redacted.Redacted
    readonly baseUrl: string
  }
>() {
  static readonly layer = Effect.gen(function* () {
    const apiKey = yield* Config.redacted("API_KEY")
    const baseUrl = yield* Config.string("API_BASE_URL")
    return ApiConfig.of({ apiKey, baseUrl })
  }).pipe(Layer.effect(ApiConfig))
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
import { Context, Effect, Layer, Redacted, Schema } from "effect"

const Port = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.between(1, 65535)
)

class DatabaseConfig extends Context.Tag("@app/DatabaseConfig")<
  DatabaseConfig,
  {
    readonly host: string
    readonly port: number
    readonly database: string
    readonly password: Redacted.Redacted
  }
>() {
  static readonly layer = Effect.gen(function* () {
    const host = yield* Schema.Config("DB_HOST", Schema.String)
    const port = yield* Schema.Config("DB_PORT", Port)
    const database = yield* Schema.Config("DB_NAME", Schema.String)
    const password = yield* Schema.Config("DB_PASSWORD", Schema.Redacted(Schema.String))

    return DatabaseConfig.of({ host, port, database, password })
  }).pipe(Layer.effect(DatabaseConfig))
}
```
