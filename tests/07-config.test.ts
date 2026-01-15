import { describe, it } from "@effect/vitest";
import { assertSome, assertTrue, strictEqual } from "@effect/vitest/utils";
import {
  Config,
  ConfigProvider,
  Context,
  Effect,
  Layer,
  Redacted,
  Schema,
} from "effect";

describe("07-config", () => {
  describe("Basic Config Usage", () => {
    it.effect("reads from ConfigProvider", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          const apiKey = yield* Config.redacted("API_KEY");
          const port = yield* Config.integer("PORT");
          return { apiKey: Redacted.value(apiKey), port };
        });

        const testConfigProvider = ConfigProvider.fromMap(
          new Map([
            ["API_KEY", "test-key-123"],
            ["PORT", "3000"],
          ]),
        );

        const TestConfigLayer = Layer.setConfigProvider(testConfigProvider);

        const result = yield* program.pipe(Effect.provide(TestConfigLayer));

        strictEqual(result.apiKey, "test-key-123");
        strictEqual(result.port, 3000);
      }),
    );

    it.effect("handles multiple config values", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          const host = yield* Config.string("HOST");
          const port = yield* Config.integer("PORT");
          const debug = yield* Config.boolean("DEBUG");
          return { host, port, debug };
        });

        const testConfig = ConfigProvider.fromMap(
          new Map([
            ["HOST", "localhost"],
            ["PORT", "8080"],
            ["DEBUG", "true"],
          ]),
        );

        const result = yield* program.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig)),
        );

        strictEqual(result.host, "localhost");
        strictEqual(result.port, 8080);
        strictEqual(result.debug, true);
      }),
    );
  });

  describe("Config Layer Pattern", () => {
    it.effect("creates config service with layer", () =>
      Effect.gen(function* () {
        class ApiConfig extends Context.Tag("@app/ApiConfig")<
          ApiConfig,
          {
            readonly apiKey: Redacted.Redacted<string>;
            readonly baseUrl: string;
            readonly timeout: number;
          }
        >() {
          static readonly layer = Effect.gen(function* () {
            const apiKey = yield* Config.redacted("API_KEY");
            const baseUrl = yield* Config.string("API_BASE_URL").pipe(
              Config.orElse(() => Config.succeed("https://api.example.com")),
            );
            const timeout = yield* Config.integer("API_TIMEOUT").pipe(
              Config.orElse(() => Config.succeed(30000)),
            );

            return ApiConfig.of({ apiKey, baseUrl, timeout });
          }).pipe(Layer.effect(ApiConfig));

          static readonly testLayer = Layer.succeed(ApiConfig, {
            apiKey: Redacted.make("test-key"),
            baseUrl: "https://test.example.com",
            timeout: 5000,
          });
        }

        const program = Effect.gen(function* () {
          const config = yield* ApiConfig;
          return {
            apiKey: Redacted.value(config.apiKey),
            baseUrl: config.baseUrl,
            timeout: config.timeout,
          };
        });

        const result = yield* program.pipe(Effect.provide(ApiConfig.testLayer));

        strictEqual(result.apiKey, "test-key");
        strictEqual(result.baseUrl, "https://test.example.com");
        strictEqual(result.timeout, 5000);
      }),
    );

    it.effect("uses real config with provider", () =>
      Effect.gen(function* () {
        class DbConfig extends Context.Tag("@app/DbConfig")<
          DbConfig,
          {
            readonly host: string;
            readonly port: number;
            readonly database: string;
          }
        >() {
          static readonly layer = Effect.gen(function* () {
            const host = yield* Config.string("DB_HOST");
            const port = yield* Config.integer("DB_PORT");
            const database = yield* Config.string("DB_NAME");

            return DbConfig.of({ host, port, database });
          }).pipe(Layer.effect(DbConfig));
        }

        const testConfig = ConfigProvider.fromMap(
          new Map([
            ["DB_HOST", "localhost"],
            ["DB_PORT", "5432"],
            ["DB_NAME", "testdb"],
          ]),
        );

        const program = Effect.gen(function* () {
          const config = yield* DbConfig;
          return config;
        });

        const result = yield* program.pipe(
          Effect.provide(DbConfig.layer),
          Effect.provide(Layer.setConfigProvider(testConfig)),
        );

        strictEqual(result.host, "localhost");
        strictEqual(result.port, 5432);
        strictEqual(result.database, "testdb");
      }),
    );
  });

  describe("Defaults and Fallbacks", () => {
    it.effect("uses orElse for defaults", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          const port = yield* Config.integer("PORT").pipe(
            Config.orElse(() => Config.succeed(3000)),
          );

          const host = yield* Config.string("HOST").pipe(
            Config.orElse(() => Config.succeed("0.0.0.0")),
          );

          return { port, host };
        });

        // Empty config - should use defaults
        const emptyConfig = ConfigProvider.fromMap(new Map());

        const result = yield* program.pipe(
          Effect.provide(Layer.setConfigProvider(emptyConfig)),
        );

        strictEqual(result.port, 3000);
        strictEqual(result.host, "0.0.0.0");
      }),
    );

    it.effect("handles optional config values", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          const required = yield* Config.string("REQUIRED");
          const optional = yield* Config.option(Config.string("OPTIONAL"));

          return { required, optional };
        });

        const testConfig = ConfigProvider.fromMap(
          new Map([["REQUIRED", "value"]]),
        );

        const result = yield* program.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig)),
        );

        strictEqual(result.required, "value");
        assertTrue(result.optional._tag === "None");
      }),
    );

    it.effect("optional returns Some when value exists", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          const optional = yield* Config.option(Config.string("OPTIONAL"));
          return optional;
        });

        const testConfig = ConfigProvider.fromMap(
          new Map([["OPTIONAL", "present"]]),
        );

        const result = yield* program.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig)),
        );

        assertSome(result, "present");
      }),
    );
  });

  describe("Validation with Schema", () => {
    it.effect("validates with Schema.Config", () =>
      Effect.gen(function* () {
        const Port = Schema.NumberFromString.pipe(
          Schema.int(),
          Schema.between(1, 65535),
        );
        const Environment = Schema.Literal(
          "development",
          "staging",
          "production",
        );

        const program = Effect.gen(function* () {
          const port = yield* Schema.Config("PORT", Port);
          const env = yield* Schema.Config("ENV", Environment);
          return { port, env };
        });

        const testConfig = ConfigProvider.fromMap(
          new Map([
            ["PORT", "8080"],
            ["ENV", "development"],
          ]),
        );

        const result = yield* program.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig)),
        );

        strictEqual(result.port, 8080);
        strictEqual(result.env, "development");
      }),
    );

    it.effect("validates with branded types", () =>
      Effect.gen(function* () {
        const Port = Schema.NumberFromString.pipe(
          Schema.int(),
          Schema.between(1, 65535),
          Schema.brand("Port"),
        );

        const program = Effect.gen(function* () {
          const port = yield* Schema.Config("PORT", Port);
          return port;
        });

        const testConfig = ConfigProvider.fromMap(new Map([["PORT", "3000"]]));

        const result = yield* program.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig)),
        );

        strictEqual(result, 3000);
      }),
    );

    it.effect("handles validation errors", () =>
      Effect.gen(function* () {
        const Port = Schema.NumberFromString.pipe(
          Schema.int(),
          Schema.between(1, 65535),
        );

        const program = Effect.gen(function* () {
          const port = yield* Schema.Config("PORT", Port);
          return port;
        });

        const invalidConfig = ConfigProvider.fromMap(
          new Map([["PORT", "99999"]]),
        );

        const result = yield* program.pipe(
          Effect.provide(Layer.setConfigProvider(invalidConfig)),
          Effect.either,
        );

        assertTrue(result._tag === "Left");
      }),
    );
  });

  describe("Config Primitives", () => {
    it.effect("reads string values", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          return yield* Config.string("MY_VAR");
        });

        const testConfig = ConfigProvider.fromMap(
          new Map([["MY_VAR", "hello"]]),
        );

        const result = yield* program.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig)),
        );

        strictEqual(result, "hello");
      }),
    );

    it.effect("reads number values", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          const number = yield* Config.number("FLOAT");
          const integer = yield* Config.integer("INT");
          return { number, integer };
        });

        const testConfig = ConfigProvider.fromMap(
          new Map([
            ["FLOAT", "3.14"],
            ["INT", "42"],
          ]),
        );

        const result = yield* program.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig)),
        );

        strictEqual(result.number, 3.14);
        strictEqual(result.integer, 42);
      }),
    );

    it.effect("reads boolean values", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          const debug = yield* Config.boolean("DEBUG");
          return debug;
        });

        const testConfig = ConfigProvider.fromMap(new Map([["DEBUG", "true"]]));

        const result = yield* program.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig)),
        );

        strictEqual(result, true);
      }),
    );

    it.effect("reads redacted values", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          const secret = yield* Config.redacted("SECRET");
          return Redacted.value(secret);
        });

        const testConfig = ConfigProvider.fromMap(
          new Map([["SECRET", "my-secret"]]),
        );

        const result = yield* program.pipe(
          Effect.provide(Layer.setConfigProvider(testConfig)),
        );

        strictEqual(result, "my-secret");
      }),
    );
  });

  describe("Complex Config Scenarios", () => {
    it.effect("combines multiple config sources", () =>
      Effect.gen(function* () {
        class AppConfig extends Context.Tag("@app/AppConfig")<
          AppConfig,
          {
            readonly server: { port: number; host: string };
            readonly database: { url: string };
            readonly features: { enableCache: boolean };
          }
        >() {
          static readonly layer = Effect.gen(function* () {
            const port = yield* Config.integer("PORT");
            const host = yield* Config.string("HOST");
            const dbUrl = yield* Config.string("DATABASE_URL");
            const enableCache = yield* Config.boolean("ENABLE_CACHE").pipe(
              Config.orElse(() => Config.succeed(false)),
            );

            return AppConfig.of({
              server: { port, host },
              database: { url: dbUrl },
              features: { enableCache },
            });
          }).pipe(Layer.effect(AppConfig));
        }

        const testConfig = ConfigProvider.fromMap(
          new Map([
            ["PORT", "8080"],
            ["HOST", "localhost"],
            ["DATABASE_URL", "postgres://localhost/test"],
          ]),
        );

        const program = Effect.gen(function* () {
          const config = yield* AppConfig;
          return config;
        });

        const result = yield* program.pipe(
          Effect.provide(AppConfig.layer),
          Effect.provide(Layer.setConfigProvider(testConfig)),
        );

        strictEqual(result.server.port, 8080);
        strictEqual(result.server.host, "localhost");
        strictEqual(result.database.url, "postgres://localhost/test");
        strictEqual(result.features.enableCache, false);
      }),
    );
  });
});
