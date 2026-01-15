import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Clock, Context, Effect, Layer, Schema } from "effect";

describe("11-testing-with-vitest", () => {
  describe("Basic Testing", () => {
    it("sync test", () => {
      const result = 1 + 1;
      expect(result).toBe(2);
    });

    it.effect("effect test", () =>
      Effect.gen(function* () {
        const result = yield* Effect.succeed(1 + 1);
        expect(result).toBe(2);
      }),
    );
  });

  describe("it.scoped", () => {
    it.scoped("temp directory is cleaned up", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;

        // makeTempDirectoryScoped creates a directory that's deleted when scope closes
        const tempDir = yield* fs.makeTempDirectoryScoped();

        // Use the temp directory
        yield* fs.writeFileString(`${tempDir}/test.txt`, "hello");
        const exists = yield* fs.exists(`${tempDir}/test.txt`);
        expect(exists).toBe(true);

        // When test ends, scope closes and tempDir is deleted
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    );
  });

  describe("Providing Layers", () => {
    class Database extends Context.Tag("Database")<
      Database,
      { query: (sql: string) => Effect.Effect<string[]> }
    >() {}

    const testDatabase = Layer.succeed(Database, {
      query: (_sql) => Effect.succeed(["mock", "data"]),
    });

    it.effect("queries database", () =>
      Effect.gen(function* () {
        const db = yield* Database;
        const results = yield* db.query("SELECT * FROM users");
        expect(results.length).toBe(2);
        expect(results[0]).toBe("mock");
      }).pipe(Effect.provide(testDatabase)),
    );
  });

  describe("Clock and Time", () => {
    it.effect("test clock starts at zero", () =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        expect(now).toBe(0);
      }),
    );

    it.live("live clock returns real time", () =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        expect(now).toBeGreaterThan(0);
      }),
    );
  });
});

// Worked Example: Testing a Service
const RegistrationId = Schema.String.pipe(Schema.brand("RegistrationId"));
// biome-ignore lint/correctness/noUnusedVariables: branded type companion
type RegistrationId = typeof RegistrationId.Type;

const EventId = Schema.String.pipe(Schema.brand("EventId"));
type EventId = typeof EventId.Type;

const UserId = Schema.String.pipe(Schema.brand("UserId"));
type UserId = typeof UserId.Type;

const TicketId = Schema.String.pipe(Schema.brand("TicketId"));
// biome-ignore lint/correctness/noUnusedVariables: branded type companion
type TicketId = typeof TicketId.Type;

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
    readonly create: (user: User) => Effect.Effect<void>;
    readonly findById: (id: UserId) => Effect.Effect<User, UserNotFound>;
  }
>() {
  // Mutable state is fine in tests - JS is single-threaded
  static readonly testLayer = Layer.sync(Users, () => {
    const store = new Map<UserId, User>();

    const create = (user: User) =>
      Effect.sync(() => void store.set(user.id, user));

    const findById = (id: UserId) =>
      Effect.fromNullable(store.get(id)).pipe(
        Effect.orElseFail(() => UserNotFound.make({ id })),
      );

    return Users.of({ create, findById });
  });
}

// Tickets service with test layer
class Tickets extends Context.Tag("@app/Tickets")<
  Tickets,
  {
    readonly issue: (eventId: EventId, userId: UserId) => Effect.Effect<Ticket>;
  }
>() {
  static readonly testLayer = Layer.sync(Tickets, () => {
    let counter = 0;

    const issue = (eventId: EventId, _userId: UserId) =>
      Effect.sync(() =>
        Ticket.make({
          id: TicketId.make(`ticket-${counter++}`),
          eventId,
          code: `CODE-${counter}`,
        }),
      );

    return Tickets.of({ issue });
  });
}

// Emails service with test layer that tracks sent emails
class Emails extends Context.Tag("@app/Emails")<
  Emails,
  {
    readonly send: (email: Email) => Effect.Effect<void>;
    readonly sent: Effect.Effect<ReadonlyArray<Email>>;
  }
>() {
  static readonly testLayer = Layer.sync(Emails, () => {
    const emails: Array<Email> = [];

    const send = (email: Email) => Effect.sync(() => void emails.push(email));

    const sent = Effect.sync(() => emails);

    return Emails.of({ send, sent });
  });
}

// Events service orchestrates leaf services
class Events extends Context.Tag("@app/Events")<
  Events,
  {
    readonly register: (
      eventId: EventId,
      userId: UserId,
    ) => Effect.Effect<Registration, UserNotFound>;
  }
>() {
  static readonly layer = Effect.gen(function* () {
    const users = yield* Users;
    const tickets = yield* Tickets;
    const emails = yield* Emails;

    const register = Effect.fn("Events.register")(function* (
      eventId: EventId,
      userId: UserId,
    ) {
      const user = yield* users.findById(userId);
      const ticket = yield* tickets.issue(eventId, userId);
      const now = yield* Clock.currentTimeMillis;

      const registration = Registration.make({
        id: RegistrationId.make(crypto.randomUUID()),
        eventId,
        userId,
        ticketId: ticket.id,
        registeredAt: new Date(now),
      });

      yield* emails.send(
        Email.make({
          to: user.email,
          subject: "Event Registration Confirmed",
          body: `Your ticket code: ${ticket.code}`,
        }),
      );

      return registration;
    });

    return Events.of({ register });
  }).pipe(Layer.effect(Events));
}

// provideMerge exposes leaf services in tests for setup/assertions
const testLayer = Events.layer.pipe(
  Layer.provideMerge(Users.testLayer),
  Layer.provideMerge(Tickets.testLayer),
  Layer.provideMerge(Emails.testLayer),
);

describe("Events.register", () => {
  it.effect("creates registration with correct data", () =>
    Effect.gen(function* () {
      const users = yield* Users;
      const events = yield* Events;

      // Arrange: create a user
      const user = User.make({
        id: UserId.make("user-123"),
        name: "Alice",
        email: "alice@example.com",
      });
      yield* users.create(user);

      // Act
      const eventId = EventId.make("event-789");
      const registration = yield* events.register(eventId, user.id);

      // Assert
      expect(registration.eventId).toBe(eventId);
      expect(registration.userId).toBe(user.id);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("sends confirmation email with ticket code", () =>
    Effect.gen(function* () {
      const users = yield* Users;
      const events = yield* Events;
      const emails = yield* Emails;

      // Arrange
      const user = User.make({
        id: UserId.make("user-456"),
        name: "Bob",
        email: "bob@example.com",
      });
      yield* users.create(user);

      // Act
      yield* events.register(EventId.make("event-789"), user.id);

      // Assert: check sent emails
      const sentEmails = yield* emails.sent;
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].to).toBe("bob@example.com");
      expect(sentEmails[0].subject).toBe("Event Registration Confirmed");
      expect(sentEmails[0].body).toContain("CODE-");
    }).pipe(Effect.provide(testLayer)),
  );
});
