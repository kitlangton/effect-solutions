import { describe, it } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { Context, Effect, Layer, Schema } from "effect";

describe("04-services-and-layers", () => {
  describe("Service Definition", () => {
    it.effect("defines service with Context.Tag", () =>
      Effect.gen(function* () {
        class Database extends Context.Tag("@app/Database")<
          Database,
          {
            readonly query: (sql: string) => Effect.Effect<unknown[]>;
            readonly execute: (sql: string) => Effect.Effect<void>;
          }
        >() {}

        class Logger extends Context.Tag("@app/Logger")<
          Logger,
          {
            readonly log: (message: string) => Effect.Effect<void>;
          }
        >() {}

        // Test implementations
        const testDb = Layer.succeed(Database, {
          query: (_sql) => Effect.succeed([{ id: 1 }]),
          execute: (_sql) => Effect.void,
        });

        const testLogger = Layer.succeed(Logger, {
          log: (_msg) => Effect.void,
        });

        const program = Effect.gen(function* () {
          const db = yield* Database;
          const logger = yield* Logger;

          yield* logger.log("Querying database");
          const results = yield* db.query("SELECT * FROM users");
          return results;
        });

        const result = yield* program.pipe(
          Effect.provide(Layer.merge(testDb, testLogger)),
        );

        deepStrictEqual(result, [{ id: 1 }]);
      }),
    );
  });

  describe("Layer Implementation", () => {
    it.effect("creates layer with Layer.effect", () =>
      Effect.gen(function* () {
        class Config extends Context.Tag("@app/Config")<
          Config,
          { readonly apiUrl: string }
        >() {}

        class Api extends Context.Tag("@app/Api")<
          Api,
          { readonly fetch: (path: string) => Effect.Effect<string> }
        >() {
          static readonly layer = Effect.gen(function* () {
            const config = yield* Config;

            const fetch = (path: string) =>
              Effect.succeed(`${config.apiUrl}${path}`);

            return Api.of({ fetch });
          }).pipe(Layer.effect(Api));
        }

        const testConfig = Layer.succeed(Config, {
          apiUrl: "https://api.test.com",
        });

        const program = Effect.gen(function* () {
          const api = yield* Api;
          return yield* api.fetch("/users");
        });

        const result = yield* program.pipe(
          Effect.provide(Api.layer),
          Effect.provide(testConfig),
        );

        strictEqual(result, "https://api.test.com/users");
      }),
    );

    it.effect("composes layers with dependencies", () =>
      Effect.gen(function* () {
        class Logger extends Context.Tag("@app/Logger")<
          Logger,
          { readonly log: (msg: string) => Effect.Effect<void> }
        >() {}

        class Analytics extends Context.Tag("@app/Analytics")<
          Analytics,
          { readonly track: (event: string) => Effect.Effect<void> }
        >() {
          static readonly layer = Effect.gen(function* () {
            const logger = yield* Logger;

            const track = (event: string) =>
              Effect.gen(function* () {
                yield* logger.log(`Tracking: ${event}`);
              });

            return Analytics.of({ track });
          }).pipe(Layer.effect(Analytics));
        }

        const events: string[] = [];
        const testLogger = Layer.succeed(Logger, {
          log: (msg) =>
            Effect.sync(() => {
              events.push(msg);
            }),
        });

        const program = Effect.gen(function* () {
          const analytics = yield* Analytics;
          yield* analytics.track("user.login");
          yield* analytics.track("page.view");
        });

        yield* program.pipe(
          Effect.provide(Analytics.layer),
          Effect.provide(testLogger),
        );

        strictEqual(events.length, 2);
        strictEqual(events[0], "Tracking: user.login");
        strictEqual(events[1], "Tracking: page.view");
      }),
    );
  });

  describe("Test Implementations", () => {
    it.effect("creates test layer with Layer.sync", () =>
      Effect.gen(function* () {
        class Database extends Context.Tag("@app/Database")<
          Database,
          {
            readonly query: (sql: string) => Effect.Effect<unknown[]>;
            readonly execute: (sql: string) => Effect.Effect<void>;
          }
        >() {
          static readonly testLayer = Layer.sync(Database, () => {
            const records: Record<string, unknown> = {
              "user-1": { id: "user-1", name: "Alice" },
              "user-2": { id: "user-2", name: "Bob" },
            };

            return Database.of({
              query: (sql) => {
                if (sql.includes("user-1")) {
                  return Effect.succeed([records["user-1"]]);
                }
                return Effect.succeed(Object.values(records));
              },
              execute: (_sql) => Effect.void,
            });
          });
        }

        const program = Effect.gen(function* () {
          const db = yield* Database;
          const results = yield* db.query(
            "SELECT * FROM users WHERE id = 'user-1'",
          );
          return results;
        });

        const result = yield* program.pipe(Effect.provide(Database.testLayer));

        strictEqual(result.length, 1);
        deepStrictEqual(result[0], { id: "user-1", name: "Alice" });
      }),
    );

    it.effect("uses Layer.succeed for simple mocks", () =>
      Effect.gen(function* () {
        class EmailService extends Context.Tag("@app/EmailService")<
          EmailService,
          { readonly send: (to: string, body: string) => Effect.Effect<void> }
        >() {}

        const sentEmails: Array<{ to: string; body: string }> = [];

        const testEmailService = Layer.succeed(EmailService, {
          send: (to, body) =>
            Effect.sync(() => {
              sentEmails.push({ to, body });
            }),
        });

        const program = Effect.gen(function* () {
          const email = yield* EmailService;
          yield* email.send("alice@test.com", "Hello Alice");
          yield* email.send("bob@test.com", "Hello Bob");
        });

        yield* program.pipe(Effect.provide(testEmailService));

        strictEqual(sentEmails.length, 2);
        strictEqual(sentEmails[0].to, "alice@test.com");
        strictEqual(sentEmails[1].to, "bob@test.com");
      }),
    );
  });

  describe("Effect.fn within Services", () => {
    it.effect("uses Effect.fn for service methods with tracing", () =>
      Effect.gen(function* () {
        class UserRepo extends Context.Tag("@app/UserRepo")<
          UserRepo,
          {
            readonly findById: (
              id: string,
            ) => Effect.Effect<{ id: string; name: string }>;
            readonly all: () => Effect.Effect<
              Array<{ id: string; name: string }>
            >;
          }
        >() {
          static readonly layer = Layer.succeed(UserRepo, {
            findById: Effect.fn("UserRepo.findById")(function* (id: string) {
              yield* Effect.logDebug(`Finding user ${id}`);
              return { id, name: `User ${id}` };
            }),
            // Effect.fn even for nullary methods (thunks) to enable tracing
            all: Effect.fn("UserRepo.all")(function* () {
              yield* Effect.logDebug("Finding all users");
              return [
                { id: "1", name: "Alice" },
                { id: "2", name: "Bob" },
              ];
            }),
          });
        }

        const program = Effect.gen(function* () {
          const repo = yield* UserRepo;
          const user = yield* repo.findById("123");
          const allUsers = yield* repo.all();
          return { user, allUsers };
        });

        const result = yield* program.pipe(Effect.provide(UserRepo.layer));

        strictEqual(result.user.id, "123");
        strictEqual(result.user.name, "User 123");
        strictEqual(result.allUsers.length, 2);
      }),
    );

    it.effect("supports Effect.fn transformers (e.g., catchTag)", () =>
      Effect.gen(function* () {
        class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
          id: Schema.String,
        }) {}

        class Repo extends Context.Tag("@app/Repo")<
          Repo,
          { readonly findById: (id: string) => Effect.Effect<string> }
        >() {
          static readonly layer = Layer.succeed(Repo, {
            findById: Effect.fn("Repo.findById")(
              function* (id: string) {
                yield* Effect.fail(NotFound.make({ id }));
              },
              Effect.catchTag("NotFound", (error) =>
                Effect.succeed(`missing:${error.id}`),
              ),
            ),
          });
        }

        const program = Effect.gen(function* () {
          const repo = yield* Repo;
          return yield* repo.findById("123");
        });

        const result = yield* program.pipe(Effect.provide(Repo.layer));
        strictEqual(result, "missing:123");
      }),
    );
  });

  describe("Service Orchestration", () => {
    it.effect("orchestrates multiple leaf services", () =>
      Effect.gen(function* () {
        // Leaf services
        class Users extends Context.Tag("@app/Users")<
          Users,
          {
            readonly findById: (
              id: string,
            ) => Effect.Effect<{ id: string; name: string }>;
          }
        >() {}

        class Notifications extends Context.Tag("@app/Notifications")<
          Notifications,
          {
            readonly send: (
              userId: string,
              message: string,
            ) => Effect.Effect<void>;
          }
        >() {}

        class Analytics extends Context.Tag("@app/Analytics")<
          Analytics,
          {
            readonly track: (
              event: string,
              data: unknown,
            ) => Effect.Effect<void>;
          }
        >() {}

        // Higher-level orchestration service
        class UserService extends Context.Tag("@app/UserService")<
          UserService,
          {
            readonly activate: (
              userId: string,
            ) => Effect.Effect<{ id: string; name: string }>;
          }
        >() {
          static readonly layer = Effect.gen(function* () {
            const users = yield* Users;
            const notifications = yield* Notifications;
            const analytics = yield* Analytics;

            const activate = Effect.fn("UserService.activate")(function* (
              userId: string,
            ) {
              const user = yield* users.findById(userId);
              yield* notifications.send(userId, "Account activated!");
              yield* analytics.track("user.activated", { userId });
              return user;
            });

            return UserService.of({ activate });
          }).pipe(Layer.effect(UserService));
        }

        // Test implementations
        const events: string[] = [];

        const testUsers = Layer.succeed(Users, {
          findById: (id) => Effect.succeed({ id, name: `User ${id}` }),
        });

        const testNotifications = Layer.succeed(Notifications, {
          send: (userId, message) =>
            Effect.sync(() => {
              events.push(`notify:${userId}:${message}`);
            }),
        });

        const testAnalytics = Layer.succeed(Analytics, {
          track: (event, data) =>
            Effect.sync(() => {
              events.push(`track:${event}:${JSON.stringify(data)}`);
            }),
        });

        const testLayers = Layer.merge(
          testUsers,
          Layer.merge(testNotifications, testAnalytics),
        );

        const program = Effect.gen(function* () {
          const service = yield* UserService;
          return yield* service.activate("user-123");
        });

        const result = yield* program.pipe(
          Effect.provide(UserService.layer),
          Effect.provide(testLayers),
        );

        strictEqual(result.id, "user-123");
        strictEqual(result.name, "User user-123");
        strictEqual(events.length, 2);
        strictEqual(events[0], "notify:user-123:Account activated!");
        strictEqual(events[1], 'track:user.activated:{"userId":"user-123"}');
      }),
    );

    it.effect(
      "design with services first - contracts before implementations",
      () =>
        Effect.gen(function* () {
          // Define service contracts without implementations
          class EmailService extends Context.Tag("@app/EmailService")<
            EmailService,
            { readonly send: (to: string, body: string) => Effect.Effect<void> }
          >() {}

          class PaymentService extends Context.Tag("@app/PaymentService")<
            PaymentService,
            {
              readonly charge: (
                userId: string,
                amount: number,
              ) => Effect.Effect<string>;
            }
          >() {}

          // Higher-level service that uses the contracts
          class CheckoutService extends Context.Tag("@app/CheckoutService")<
            CheckoutService,
            {
              readonly process: (
                userId: string,
                amount: number,
              ) => Effect.Effect<string>;
            }
          >() {
            static readonly layer = Effect.gen(function* () {
              const email = yield* EmailService;
              const payment = yield* PaymentService;

              const process = Effect.fn("CheckoutService.process")(function* (
                userId: string,
                amount: number,
              ) {
                const txId = yield* payment.charge(userId, amount);
                yield* email.send(userId, `Payment successful: ${txId}`);
                return txId;
              });

              return CheckoutService.of({ process });
            }).pipe(Layer.effect(CheckoutService));
          }

          // Implement test versions later
          const testEmail = Layer.succeed(EmailService, {
            send: (_to, _body) => Effect.void,
          });

          const testPayment = Layer.succeed(PaymentService, {
            charge: (_userId, _amount) => Effect.succeed("tx-123"),
          });

          // The orchestration layer (CheckoutService) works without changing
          const program = Effect.gen(function* () {
            const checkout = yield* CheckoutService;
            return yield* checkout.process("user-1", 100);
          });

          const result = yield* program.pipe(
            Effect.provide(CheckoutService.layer),
            Effect.provide(Layer.merge(testEmail, testPayment)),
          );

          strictEqual(result, "tx-123");
        }),
    );
  });

  describe("Service Composition", () => {
    it.effect("merges independent layers", () =>
      Effect.gen(function* () {
        class ServiceA extends Context.Tag("@app/ServiceA")<
          ServiceA,
          { readonly getValue: () => Effect.Effect<string> }
        >() {}

        class ServiceB extends Context.Tag("@app/ServiceB")<
          ServiceB,
          { readonly getValue: () => Effect.Effect<number> }
        >() {}

        const layerA = Layer.succeed(ServiceA, {
          getValue: () => Effect.succeed("A"),
        });

        const layerB = Layer.succeed(ServiceB, {
          getValue: () => Effect.succeed(42),
        });

        const program = Effect.gen(function* () {
          const a = yield* ServiceA;
          const b = yield* ServiceB;
          const valueA = yield* a.getValue();
          const valueB = yield* b.getValue();
          return `${valueA}-${valueB}`;
        });

        const result = yield* program.pipe(
          Effect.provide(Layer.merge(layerA, layerB)),
        );

        strictEqual(result, "A-42");
      }),
    );

    it.effect("chains dependent layers", () =>
      Effect.gen(function* () {
        class Config extends Context.Tag("@app/Config")<
          Config,
          { readonly prefix: string }
        >() {}

        class Formatter extends Context.Tag("@app/Formatter")<
          Formatter,
          { readonly format: (msg: string) => Effect.Effect<string> }
        >() {
          static readonly layer = Effect.gen(function* () {
            const config = yield* Config;
            return Formatter.of({
              format: (msg) => Effect.succeed(`[${config.prefix}] ${msg}`),
            });
          }).pipe(Layer.effect(Formatter));
        }

        const configLayer = Layer.succeed(Config, { prefix: "TEST" });

        const program = Effect.gen(function* () {
          const formatter = yield* Formatter;
          return yield* formatter.format("Hello");
        });

        const result = yield* program.pipe(
          Effect.provide(Formatter.layer),
          Effect.provide(configLayer),
        );

        strictEqual(result, "[TEST] Hello");
      }),
    );

    it.effect("Layer.provide satisfies dependencies", () =>
      Effect.gen(function* () {
        class Config extends Context.Tag("@app/Config")<
          Config,
          { readonly url: string }
        >() {}

        class Database extends Context.Tag("@app/Database")<
          Database,
          { readonly query: () => Effect.Effect<string> }
        >() {
          static readonly layer = Effect.gen(function* () {
            const config = yield* Config;
            return Database.of({ query: () => Effect.succeed(config.url) });
          }).pipe(Layer.effect(Database));
        }

        // Layer.provide wires up the dependency
        const DatabaseLive = Database.layer.pipe(
          Layer.provide(Layer.succeed(Config, { url: "postgres://test" })),
        );

        const program = Effect.gen(function* () {
          const db = yield* Database;
          return yield* db.query();
        });

        const result = yield* program.pipe(Effect.provide(DatabaseLive));
        strictEqual(result, "postgres://test");
      }),
    );

    it.effect("Layer.provideMerge exposes the provider", () =>
      Effect.gen(function* () {
        class Config extends Context.Tag("@app/Config")<
          Config,
          { readonly env: string }
        >() {}

        class Logger extends Context.Tag("@app/Logger")<
          Logger,
          { readonly log: () => Effect.Effect<string> }
        >() {
          static readonly layer = Effect.gen(function* () {
            const config = yield* Config;
            return Logger.of({ log: () => Effect.succeed(`[${config.env}]`) });
          }).pipe(Layer.effect(Logger));
        }

        // provideMerge: Logger + Config both available
        const LoggerWithConfig = Logger.layer.pipe(
          Layer.provideMerge(Layer.succeed(Config, { env: "test" })),
        );

        const program = Effect.gen(function* () {
          const logger = yield* Logger;
          const config = yield* Config; // Config is also available!
          const prefix = yield* logger.log();
          return `${prefix} env=${config.env}`;
        });

        const result = yield* program.pipe(Effect.provide(LoggerWithConfig));
        strictEqual(result, "[test] env=test");
      }),
    );
  });

  describe("Providing Layers to Effects", () => {
    it.effect("provide once at entry point", () =>
      Effect.gen(function* () {
        class Config extends Context.Tag("@app/Config")<
          Config,
          { readonly name: string }
        >() {}

        class Logger extends Context.Tag("@app/Logger")<
          Logger,
          { readonly info: (msg: string) => Effect.Effect<void> }
        >() {}

        class App extends Context.Tag("@app/App")<
          App,
          { readonly run: () => Effect.Effect<string> }
        >() {
          static readonly layer = Effect.gen(function* () {
            const config = yield* Config;
            const logger = yield* Logger;
            return App.of({
              run: () =>
                Effect.gen(function* () {
                  yield* logger.info("Starting");
                  return config.name;
                }),
            });
          }).pipe(Layer.effect(App));
        }

        const logs: string[] = [];

        // Compose all layers into MainLive
        const MainLive = App.layer.pipe(
          Layer.provideMerge(
            Layer.succeed(Logger, {
              info: (msg) => Effect.sync(() => void logs.push(msg)),
            }),
          ),
          Layer.provideMerge(Layer.succeed(Config, { name: "TestApp" })),
        );

        // Program uses services freely
        const program = Effect.gen(function* () {
          const app = yield* App;
          return yield* app.run();
        });

        // Provide once at the top
        const result = yield* program.pipe(Effect.provide(MainLive));

        strictEqual(result, "TestApp");
        strictEqual(logs[0], "Starting");
      }),
    );
  });

  describe("Layer Memoization", () => {
    it.effect("memoizes layers by reference identity", () =>
      Effect.gen(function* () {
        let constructionCount = 0;

        class Expensive extends Context.Tag("@app/Expensive")<
          Expensive,
          { readonly id: number }
        >() {}

        class ServiceA extends Context.Tag("@app/ServiceA")<
          ServiceA,
          { readonly getValue: () => Effect.Effect<number> }
        >() {}

        class ServiceB extends Context.Tag("@app/ServiceB")<
          ServiceB,
          { readonly getValue: () => Effect.Effect<number> }
        >() {}

        // Shared layer as a constant
        const ExpensiveLive = Effect.sync(() => {
          constructionCount++;
          return Expensive.of({ id: constructionCount });
        }).pipe(Layer.effect(Expensive));

        // Both services depend on the same ExpensiveLive reference
        const ServiceALive = Expensive.pipe(
          Effect.map((exp) =>
            ServiceA.of({ getValue: () => Effect.succeed(exp.id) }),
          ),
          Layer.effect(ServiceA),
          Layer.provide(ExpensiveLive),
        );

        const ServiceBLive = Expensive.pipe(
          Effect.map((exp) =>
            ServiceB.of({ getValue: () => Effect.succeed(exp.id) }),
          ),
          Layer.effect(ServiceB),
          Layer.provide(ExpensiveLive),
        );

        // ExpensiveLive appears twice but same reference = memoized
        const AppLive = Layer.merge(ServiceALive, ServiceBLive);

        const program = Effect.gen(function* () {
          const a = yield* ServiceA;
          const b = yield* ServiceB;
          const valA = yield* a.getValue();
          const valB = yield* b.getValue();
          return { valA, valB, constructionCount };
        });

        const result = yield* program.pipe(Effect.provide(AppLive));

        // Constructed only once due to memoization
        strictEqual(result.constructionCount, 1);
        strictEqual(result.valA, 1);
        strictEqual(result.valB, 1);
      }),
    );

    it.effect("inline layer creation breaks memoization", () =>
      Effect.gen(function* () {
        let constructionCount = 0;

        class Shared extends Context.Tag("@app/Shared")<
          Shared,
          { readonly id: number }
        >() {}

        const makeSharedLayer = () =>
          Effect.sync(() => {
            constructionCount++;
            return { id: constructionCount };
          }).pipe(Layer.effect(Shared));

        class ServiceA extends Context.Tag("@app/ServiceA")<
          ServiceA,
          { readonly id: number }
        >() {}

        class ServiceB extends Context.Tag("@app/ServiceB")<
          ServiceB,
          { readonly id: number }
        >() {}

        // Bad: inline calls create different references
        const ServiceALive = Shared.pipe(
          Effect.map((s) => ({ id: s.id })),
          Layer.effect(ServiceA),
          Layer.provide(makeSharedLayer()),
        ); // new instance

        const ServiceBLive = Shared.pipe(
          Effect.map((s) => ({ id: s.id })),
          Layer.effect(ServiceB),
          Layer.provide(makeSharedLayer()),
        ); // another new instance

        const AppLive = Layer.merge(ServiceALive, ServiceBLive);

        const program = Effect.gen(function* () {
          const a = yield* ServiceA;
          const b = yield* ServiceB;
          return { idA: a.id, idB: b.id, constructionCount };
        });

        const result = yield* program.pipe(Effect.provide(AppLive));

        // Constructed twice because different references
        strictEqual(result.constructionCount, 2);
        strictEqual(result.idA, 1);
        strictEqual(result.idB, 2);
      }),
    );
  });

  describe("it.layer", () => {
    class Counter extends Context.Tag("@app/Counter")<
      Counter,
      {
        readonly get: () => Effect.Effect<number>;
        readonly increment: () => Effect.Effect<void>;
      }
    >() {
      static readonly layer = Layer.sync(Counter, () => {
        let count = 0;
        return {
          get: () => Effect.succeed(count),
          increment: () => Effect.sync(() => void count++),
        };
      });
    }

    it.layer(Counter.layer)("counter", (it) => {
      it.effect("starts at zero", () =>
        Effect.gen(function* () {
          const counter = yield* Counter;
          strictEqual(yield* counter.get(), 0);
        }),
      );

      it.effect("increments", () =>
        Effect.gen(function* () {
          const counter = yield* Counter;
          yield* counter.increment();
          // State persists: the first test already ran, so count was 0, now it's 1
          strictEqual(yield* counter.get(), 1);
        }),
      );
    });
  });
});
