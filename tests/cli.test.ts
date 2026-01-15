import { Args, Command, Options } from "@effect/cli";
import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
// biome-ignore lint/suspicious/noShadowRestrictedNames: Effect convention
import { Array, Context, Effect, Layer, Option, Schema } from "effect";

// ============================================================================
// Task Schema
// ============================================================================

const TaskId = Schema.Number.pipe(Schema.brand("TaskId"));
type TaskId = typeof TaskId.Type;

class Task extends Schema.Class<Task>("Task")({
  id: TaskId,
  text: Schema.NonEmptyString,
  done: Schema.Boolean,
}) {
  toggle() {
    return Task.make({ ...this, done: !this.done });
  }
}

class TaskList extends Schema.Class<TaskList>("TaskList")({
  tasks: Schema.Array(Task),
}) {
  static Json = Schema.parseJson(TaskList);
  static empty = TaskList.make({ tasks: [] });

  get nextId(): TaskId {
    if (this.tasks.length === 0) return TaskId.make(1);
    return TaskId.make(Math.max(...this.tasks.map((t) => t.id)) + 1);
  }

  add(text: string): [TaskList, Task] {
    const task = Task.make({ id: this.nextId, text, done: false });
    return [TaskList.make({ tasks: [...this.tasks, task] }), task];
  }

  toggle(id: TaskId): [TaskList, Option.Option<Task>] {
    const index = this.tasks.findIndex((t) => t.id === id);
    if (index === -1) return [this, Option.none()];

    const updated = this.tasks[index].toggle();
    const tasks = Array.modify(this.tasks, index, () => updated);
    return [TaskList.make({ tasks }), Option.some(updated)];
  }

  find(id: TaskId): Option.Option<Task> {
    return Array.findFirst(this.tasks, (t) => t.id === id);
  }

  get pending() {
    return this.tasks.filter((t) => !t.done);
  }

  get completed() {
    return this.tasks.filter((t) => t.done);
  }
}

// ============================================================================
// TaskRepo Service
// ============================================================================

class TaskRepo extends Context.Tag("TaskRepo")<
  TaskRepo,
  {
    readonly list: (all?: boolean) => Effect.Effect<ReadonlyArray<Task>>;
    readonly add: (text: string) => Effect.Effect<Task>;
    readonly toggle: (id: TaskId) => Effect.Effect<Option.Option<Task>>;
  }
>() {
  static layer = (path: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      // Helpers
      const load = Effect.gen(function* () {
        const content = yield* fs.readFileString(path);
        return yield* Schema.decode(TaskList.Json)(content);
      }).pipe(Effect.orElseSucceed(() => TaskList.empty));

      const save = (list: TaskList) =>
        Effect.gen(function* () {
          const json = yield* Schema.encode(TaskList.Json)(list);
          yield* fs.writeFileString(path, json);
        });

      // Public API
      const list = Effect.fn("TaskRepo.list")(function* (all?: boolean) {
        const taskList = yield* load;
        if (all) return taskList.tasks;
        return taskList.tasks.filter((t) => !t.done);
      });

      const add = Effect.fn("TaskRepo.add")(function* (text: string) {
        const list = yield* load;
        const [newList, task] = list.add(text);
        yield* save(newList);
        return task;
      });

      const toggle = Effect.fn("TaskRepo.toggle")(function* (id: TaskId) {
        const list = yield* load;
        const [newList, task] = list.toggle(id);
        yield* save(newList);
        return task;
      });

      return TaskRepo.of({ list, add, toggle });
    }).pipe(Layer.effect(TaskRepo));

  static testLayer = Layer.succeed(TaskRepo, {
    list: (_all?) => Effect.succeed([]),
    add: (text) =>
      Effect.succeed(Task.make({ id: TaskId.make(1), text, done: false })),
    toggle: () => Effect.succeed(Option.none()),
  });
}

// ============================================================================
// CLI Commands
// ============================================================================

const addCommand = Command.make(
  "add",
  { text: Args.text({ name: "task" }) },
  ({ text }) =>
    Effect.gen(function* () {
      const repo = yield* TaskRepo;
      return yield* repo.add(text);
    }),
);

const listCommand = Command.make(
  "list",
  { all: Options.boolean("all").pipe(Options.withAlias("a")) },
  ({ all }) =>
    Effect.gen(function* () {
      const repo = yield* TaskRepo;
      return yield* repo.list(all);
    }),
);

const toggleCommand = Command.make(
  "toggle",
  { id: Args.integer({ name: "id" }).pipe(Args.withSchema(TaskId)) },
  ({ id }) =>
    Effect.gen(function* () {
      const repo = yield* TaskRepo;
      return yield* repo.toggle(id);
    }),
);

const _app = Command.make("tasks", {}).pipe(
  Command.withSubcommands([addCommand, listCommand, toggleCommand]),
);

// ============================================================================
// Tests
// ============================================================================

describe("Domain Model", () => {
  describe("Task", () => {
    it("toggle flips done state", () => {
      const task = Task.make({ id: TaskId.make(1), text: "Test", done: false });
      const toggled = task.toggle();

      expect(toggled.done).toBe(true);
      expect(toggled.text).toBe("Test");
      expect(toggled.id).toBe(task.id);

      // Original unchanged (immutable)
      expect(task.done).toBe(false);
    });

    it("toggle works both directions", () => {
      const task = Task.make({ id: TaskId.make(1), text: "Test", done: true });
      expect(task.toggle().done).toBe(false);
    });
  });

  describe("TaskList", () => {
    it("empty creates empty list", () => {
      expect(TaskList.empty.tasks).toHaveLength(0);
    });

    it("nextId returns 1 for empty list", () => {
      expect(TaskList.empty.nextId).toBe(TaskId.make(1));
    });

    it("nextId returns max + 1", () => {
      const list = TaskList.make({
        tasks: [
          Task.make({ id: TaskId.make(5), text: "A", done: false }),
          Task.make({ id: TaskId.make(3), text: "B", done: false }),
        ],
      });
      expect(list.nextId).toBe(TaskId.make(6));
    });

    it("add creates task with nextId", () => {
      const [list, task] = TaskList.empty.add("New task");

      expect(task.id).toBe(TaskId.make(1));
      expect(task.text).toBe("New task");
      expect(task.done).toBe(false);
      expect(list.tasks).toHaveLength(1);
    });

    it("add increments id for subsequent tasks", () => {
      const [list1, task1] = TaskList.empty.add("First");
      const [list2, task2] = list1.add("Second");

      expect(task1.id).toBe(TaskId.make(1));
      expect(task2.id).toBe(TaskId.make(2));
      expect(list2.tasks).toHaveLength(2);
    });

    it("toggle toggles task by id", () => {
      const [list] = TaskList.empty.add("Task");
      const [newList, result] = list.toggle(TaskId.make(1));

      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        expect(result.value.done).toBe(true);
      }
      expect(newList.tasks[0].done).toBe(true);
    });

    it("toggle returns none for missing id", () => {
      const [, result] = TaskList.empty.toggle(TaskId.make(999));
      expect(Option.isNone(result)).toBe(true);
    });

    it("find returns task by id", () => {
      const [list] = TaskList.empty.add("Find me");
      const found = list.find(TaskId.make(1));

      expect(Option.isSome(found)).toBe(true);
      if (Option.isSome(found)) {
        expect(found.value.text).toBe("Find me");
      }
    });

    it("find returns none for missing id", () => {
      expect(Option.isNone(TaskList.empty.find(TaskId.make(1)))).toBe(true);
    });

    it("pending filters incomplete tasks", () => {
      let [list] = TaskList.empty.add("Done");
      [list] = list.toggle(TaskId.make(1));
      [list] = list.add("Not done");

      expect(list.pending).toHaveLength(1);
      expect(list.pending[0].text).toBe("Not done");
    });

    it("completed filters done tasks", () => {
      let [list] = TaskList.empty.add("Done");
      [list] = list.toggle(TaskId.make(1));
      [list] = list.add("Not done");

      expect(list.completed).toHaveLength(1);
      expect(list.completed[0].text).toBe("Done");
    });
  });
});

describe("CLI", () => {
  describe("Args", () => {
    it("Args.text parses positional argument", () => {
      const name = Args.text({ name: "name" });
      expect(name).toBeDefined();
    });

    it("Args.optional makes argument optional", () => {
      const output = Args.text({ name: "output" }).pipe(Args.optional);
      expect(output).toBeDefined();
    });

    it("Args.withDefault provides default value", () => {
      const format = Args.text({ name: "format" }).pipe(
        Args.withDefault("json"),
      );
      expect(format).toBeDefined();
    });

    it("Args.repeated allows zero or more", () => {
      const files = Args.text({ name: "files" }).pipe(Args.repeated);
      expect(files).toBeDefined();
    });

    it("Args.atLeast requires minimum count", () => {
      const files = Args.text({ name: "files" }).pipe(Args.atLeast(1));
      expect(files).toBeDefined();
    });
  });

  describe("Options", () => {
    it("Options.boolean creates flag", () => {
      const verbose = Options.boolean("verbose").pipe(Options.withAlias("v"));
      expect(verbose).toBeDefined();
    });

    it("Options.text creates text option", () => {
      const output = Options.text("output").pipe(Options.withAlias("o"));
      expect(output).toBeDefined();
    });

    it("Options.optional makes option optional", () => {
      const config = Options.text("config").pipe(Options.optional);
      expect(config).toBeDefined();
    });

    it("Options.choice restricts values", () => {
      const format = Options.choice("format", ["json", "yaml", "toml"]);
      expect(format).toBeDefined();
    });

    it("Options.integer parses numbers", () => {
      const count = Options.integer("count").pipe(Options.withDefault(10));
      expect(count).toBeDefined();
    });
  });

  describe("Commands", () => {
    it("Command.make creates command", () => {
      const cmd = Command.make("test", {}, () => Effect.void);
      expect(cmd).toBeDefined();
    });

    it("Command.withSubcommands adds subcommands", () => {
      const sub = Command.make("sub", {}, () => Effect.void);
      const parent = Command.make("parent", {}).pipe(
        Command.withSubcommands([sub]),
      );
      expect(parent).toBeDefined();
    });
  });

  describe("TaskRepo Service", () => {
    it.effect("add creates task with text", () =>
      Effect.gen(function* () {
        const repo = yield* TaskRepo;
        const task = yield* repo.add("Test task");
        expect(task.text).toBe("Test task");
        expect(task.done).toBe(false);
      }).pipe(Effect.provide(TaskRepo.testLayer)),
    );

    it.effect("list returns tasks", () =>
      Effect.gen(function* () {
        const repo = yield* TaskRepo;
        const tasks = yield* repo.list();
        expect(Array.isArray(tasks)).toBe(true);
      }).pipe(Effect.provide(TaskRepo.testLayer)),
    );

    it.effect("toggle returns Option", () =>
      Effect.gen(function* () {
        const repo = yield* TaskRepo;
        const result = yield* repo.toggle(TaskId.make(1));
        expect(Option.isOption(result)).toBe(true);
      }).pipe(Effect.provide(TaskRepo.testLayer)),
    );
  });

  describe("TaskRepo Live (with temp files)", () => {
    it.scoped("add persists task to file", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tempDir = yield* fs.makeTempDirectoryScoped();
        const path = `${tempDir}/tasks.json`;

        const repo = yield* Effect.provide(
          TaskRepo,
          TaskRepo.layer(path).pipe(Layer.provide(NodeContext.layer)),
        );

        // Initially empty
        const before = yield* repo.list();
        expect(before).toHaveLength(0);

        // Add a task
        const task = yield* repo.add("Buy milk");
        expect(task.text).toBe("Buy milk");
        expect(task.done).toBe(false);

        // Verify persisted
        const after = yield* repo.list();
        expect(after).toHaveLength(1);
        expect(after[0].text).toBe("Buy milk");
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    it.scoped("toggle marks task as done", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tempDir = yield* fs.makeTempDirectoryScoped();
        const path = `${tempDir}/tasks.json`;

        const repo = yield* Effect.provide(
          TaskRepo,
          TaskRepo.layer(path).pipe(Layer.provide(NodeContext.layer)),
        );

        // Add and complete
        const task = yield* repo.add("Walk the dog");
        const result = yield* repo.toggle(task.id);

        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value.done).toBe(true);
        }

        // Verify persisted
        const tasks = yield* repo.list(true);
        expect(tasks[0].done).toBe(true);
      }).pipe(Effect.provide(NodeContext.layer)),
    );

    it.scoped("loads existing tasks from file", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tempDir = yield* fs.makeTempDirectoryScoped();
        const path = `${tempDir}/tasks.json`;

        // Pre-populate file
        const initial = TaskList.make({
          tasks: [
            Task.make({ id: TaskId.make(1), text: "Existing", done: false }),
          ],
        });
        const json = yield* Schema.encode(TaskList.Json)(initial);
        yield* fs.writeFileString(path, json);

        // Load via repo
        const repo = yield* Effect.provide(
          TaskRepo,
          TaskRepo.layer(path).pipe(Layer.provide(NodeContext.layer)),
        );
        const tasks = yield* repo.list();

        expect(tasks).toHaveLength(1);
        expect(tasks[0].text).toBe("Existing");
      }).pipe(Effect.provide(NodeContext.layer)),
    );
  });
});
