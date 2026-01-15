---
title: Command-Line Interfaces
description: "Build CLIs with @effect/cli: commands, args, options, and service integration"
order: 13
group: Ecosystem
---

# Command-Line Interfaces

`@effect/cli` provides typed argument parsing, automatic help generation, and seamless integration with Effect services. This guide covers the 20% of the API that handles 80% of CLI use cases.

## Installation

```bash
bun add @effect/cli @effect/platform @effect/platform-bun
```

For Node.js, use `@effect/platform-node` instead.

## Minimal Example

A greeting CLI with a name argument and `--shout` flag:

```typescript
import { Args, Command, Options } from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Console, Effect } from "effect"

const name = Args.text({ name: "name" }).pipe(Args.withDefault("World"))
const shout = Options.boolean("shout").pipe(Options.withAlias("s"))

const greet = Command.make("greet", { name, shout }, ({ name, shout }) => {
  const message = `Hello, ${name}!`
  return Console.log(shout ? message.toUpperCase() : message)
})

const cli = Command.run(greet, {
  name: "greet",
  version: "1.0.0"
})

cli(process.argv).pipe(
  Effect.provide(BunContext.layer),
  BunRuntime.runMain
)
```

Run it:

```bash
bun run greet.ts              # Hello, World!
bun run greet.ts Alice        # Hello, Alice!
bun run greet.ts --shout Bob  # HELLO, BOB!
bun run greet.ts --help       # Shows usage
```

Built-in flags (`--help`, `--version`) work automatically.

## Arguments and Options

**Arguments** are positional. **Options** are named flags. Options must come before arguments: `cmd --flag arg` works, `cmd arg --flag` doesn't.

### Argument Patterns

```typescript
import { Args } from "@effect/cli"

// Required text
Args.text({ name: "file" })

// Optional argument
Args.text({ name: "output" }).pipe(Args.optional)

// With default
Args.text({ name: "format" }).pipe(Args.withDefault("json"))

// Repeated (zero or more)
Args.text({ name: "files" }).pipe(Args.repeated)

// At least one
Args.text({ name: "files" }).pipe(Args.atLeast(1))
```

### Option Patterns

```typescript
import { Options } from "@effect/cli"

// Boolean flag
Options.boolean("verbose").pipe(Options.withAlias("v"))

// Text option
Options.text("output").pipe(Options.withAlias("o"))

// Optional text
Options.text("config").pipe(Options.optional)

// Choice from fixed values
Options.choice("format", ["json", "yaml", "toml"])

// Integer
Options.integer("count").pipe(Options.withDefault(10))
```

## Subcommands

Most CLIs have multiple commands. Use `Command.withSubcommands`:

```typescript
import { Args, Command } from "@effect/cli"
import { Console } from "effect"

const task = Args.text({ name: "task" })

const add = Command.make("add", { task }, ({ task }) =>
  Console.log(`Adding: ${task}`)
)

const list = Command.make("list", {}, () =>
  Console.log("Listing tasks...")
)

const app = Command.make("tasks").pipe(
  Command.withSubcommands([add, list])
)
```

```bash
tasks add "Buy milk"   # Adding: Buy milk
tasks list             # Listing tasks...
tasks --help           # Shows available subcommands
```

## Worked Example: Task Manager CLI

Let's build a complete task manager that persists tasks to a JSON file. This combines CLI parsing with services and Schema.

<TerminalDemo />

| Command | Description |
|---------|-------------|
| `tasks add <task>` | Add a new task |
| `tasks list` | List pending tasks |
| `tasks list --all` | List all tasks including completed |
| `tasks toggle <id>` | Toggle a task's done status |
| `tasks clear` | Clear all tasks |

This demo stores tasks in your browser's localStorage. Reload the page and they'll still be there. Use Ctrl+L to clear the screen.

### The Task Schema

```typescript
import { Array, Option, Schema } from "effect"

const TaskId = Schema.Number.pipe(Schema.brand("TaskId"))
type TaskId = typeof TaskId.Type

class Task extends Schema.Class<Task>("Task")({
  id: TaskId,
  text: Schema.NonEmptyString,
  done: Schema.Boolean
}) {
  toggle() {
    return Task.make({ ...this, done: !this.done })
  }
}

class TaskList extends Schema.Class<TaskList>("TaskList")({
  tasks: Schema.Array(Task)
}) {
  static Json = Schema.parseJson(TaskList)
  static empty = TaskList.make({ tasks: [] })

  get nextId(): TaskId {
    if (this.tasks.length === 0) return TaskId.make(1)
    return TaskId.make(Math.max(...this.tasks.map((t) => t.id)) + 1)
  }

  add(text: string): [TaskList, Task] {
    const task = Task.make({ id: this.nextId, text, done: false })
    return [TaskList.make({ tasks: [...this.tasks, task] }), task]
  }

  toggle(id: TaskId): [TaskList, Option.Option<Task>] {
    const index = this.tasks.findIndex((t) => t.id === id)
    if (index === -1) return [this, Option.none()]

    const updated = this.tasks[index].toggle()
    const tasks = Array.modify(this.tasks, index, () => updated)
    return [TaskList.make({ tasks }), Option.some(updated)]
  }

  find(id: TaskId): Option.Option<Task> {
    return Array.findFirst(this.tasks, (t) => t.id === id)
  }

  get pending() {
    return this.tasks.filter((t) => !t.done)
  }

  get completed() {
    return this.tasks.filter((t) => t.done)
  }
}
```

### The TaskRepo Service

```typescript
import { Array, Context, Effect, Layer, Option, Schema } from "effect"
import { FileSystem } from "@effect/platform"
// hide-start
const TaskId = Schema.Number.pipe(Schema.brand("TaskId"))
type TaskId = typeof TaskId.Type

class Task extends Schema.Class<Task>("Task")({
  id: TaskId,
  text: Schema.NonEmptyString,
  done: Schema.Boolean
}) {
  toggle() {
    return Task.make({ ...this, done: !this.done })
  }
}

class TaskList extends Schema.Class<TaskList>("TaskList")({
  tasks: Schema.Array(Task)
}) {
  static Json = Schema.parseJson(TaskList)
  static empty = TaskList.make({ tasks: [] })

  add(text: string): [TaskList, Task] {
    const task = Task.make({ id: this.nextId, text, done: false })
    return [TaskList.make({ tasks: [...this.tasks, task] }), task]
  }

  toggle(id: TaskId): [TaskList, Option.Option<Task>] {
    const index = this.tasks.findIndex((t) => t.id === id)
    if (index === -1) return [this, Option.none()]
    const updated = this.tasks[index]!.toggle()
    const tasks = Array.modify(this.tasks, index, () => updated)
    return [TaskList.make({ tasks }), Option.some(updated)]
  }

  get nextId(): TaskId {
    if (this.tasks.length === 0) return TaskId.make(1)
    return TaskId.make(Math.max(...this.tasks.map((t) => t.id)) + 1)
  }
}

// hide-end

class TaskRepo extends Context.Tag("TaskRepo")<
  TaskRepo,
  {
    readonly list: (all?: boolean) => Effect.Effect<ReadonlyArray<Task>>
    readonly add: (text: string) => Effect.Effect<Task>
    readonly toggle: (id: TaskId) => Effect.Effect<Option.Option<Task>>
    readonly clear: () => Effect.Effect<void>
  }
>() {
  static layer = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = "tasks.json"

    // Helpers
    const load = Effect.gen(function* () {
      const content = yield* fs.readFileString(path)
      return yield* Schema.decode(TaskList.Json)(content)
    }).pipe(Effect.orElseSucceed(() => TaskList.empty))

    const save = (list: TaskList) =>
      Effect.gen(function* () {
        const json = yield* Schema.encode(TaskList.Json)(list)
        yield* fs.writeFileString(path, json)
      })

    // Public API
    const list = Effect.fn("TaskRepo.list")(function* (all?: boolean) {
      const taskList = yield* load
      if (all) return taskList.tasks
      return taskList.tasks.filter((t) => !t.done)
    })

    const add = Effect.fn("TaskRepo.add")(function* (text: string) {
      const list = yield* load
      const [newList, task] = list.add(text)
      yield* save(newList)
      return task
    })

    const toggle = Effect.fn("TaskRepo.toggle")(function* (id: TaskId) {
      const list = yield* load
      const [newList, task] = list.toggle(id)
      yield* save(newList)
      return task
    })

    const clear = Effect.fn("TaskRepo.clear")(function* () {
      yield* save(TaskList.empty)
    })

    return TaskRepo.of({ list, add, toggle, clear })
  }).pipe(Layer.effect(TaskRepo))
}
```

### The CLI Commands

```typescript
import { Args, Command, Options } from "@effect/cli"
import { Console, Context, Effect, Option, Schema } from "effect"

// hide-start
// Minimal stubs to keep this example self-contained for typechecking
const TaskId = Schema.Number.pipe(Schema.brand("TaskId"))
type TaskId = typeof TaskId.Type
type Task = { id: number; text: string; done: boolean }

class TaskRepo extends Context.Tag("TaskRepo")<
  TaskRepo,
  {
    readonly add: (text: string) => Effect.Effect<Task>
    readonly list: (all?: boolean) => Effect.Effect<ReadonlyArray<Task>>
    readonly toggle: (id: TaskId) => Effect.Effect<Option.Option<Task>>
    readonly clear: () => Effect.Effect<void>
  }
>() {}
// hide-end

// add <task>
const text = Args.text({ name: "task" }).pipe(
  Args.withDescription("The task description")
)

const addCommand = Command.make("add", { text }, ({ text }) =>
  Effect.gen(function* () {
    const repo = yield* TaskRepo
    const task = yield* repo.add(text)
    yield* Console.log(`Added task #${task.id}: ${task.text}`)
  })
).pipe(Command.withDescription("Add a new task"))

// list [--all]
const all = Options.boolean("all").pipe(
  Options.withAlias("a"),
  Options.withDescription("Show all tasks including completed")
)

const listCommand = Command.make("list", { all }, ({ all }) =>
  Effect.gen(function* () {
    const repo = yield* TaskRepo
    const tasks = yield* repo.list(all)

    if (tasks.length === 0) {
      yield* Console.log("No tasks.")
      return
    }

    for (const task of tasks) {
      const status = task.done ? "[x]" : "[ ]"
      yield* Console.log(`${status} #${task.id} ${task.text}`)
    }
  })
).pipe(Command.withDescription("List pending tasks"))

// toggle <id>
const id = Args.integer({ name: "id" }).pipe(
  Args.withSchema(TaskId),
  Args.withDescription("The task ID to toggle")
)

const toggleCommand = Command.make("toggle", { id }, ({ id }) =>
  Effect.gen(function* () {
    const repo = yield* TaskRepo
    const result = yield* repo.toggle(id)

    yield* Option.match(result, {
      onNone: () => Console.log(`Task #${id} not found`),
      onSome: (task) => Console.log(`Toggled: ${task.text} (${task.done ? "done" : "pending"})`)
    })
  })
).pipe(Command.withDescription("Toggle a task's done status"))

// clear
const clearCommand = Command.make("clear", {}, () =>
  Effect.gen(function* () {
    const repo = yield* TaskRepo
    yield* repo.clear()
    yield* Console.log("Cleared all tasks.")
  })
).pipe(Command.withDescription("Clear all tasks"))

const app = Command.make("tasks", {}).pipe(
  Command.withDescription("A simple task manager"),
  Command.withSubcommands([addCommand, listCommand, toggleCommand, clearCommand])
)
```

### Wiring It Together

```typescript
import { BunContext, BunRuntime } from "@effect/platform-bun"

const cli = Command.run(app, {
  name: "tasks",
  version: "1.0.0"
})

const mainLayer = Layer.provideMerge(TaskRepo.layer, BunContext.layer)

cli(process.argv).pipe(Effect.provide(mainLayer), BunRuntime.runMain)
```

### Using the CLI

```bash
tasks add "Buy milk"
# Added task #1: Buy milk

tasks add "Walk the dog"
# Added task #2: Walk the dog

tasks list
# [ ] #1 Buy milk
# [ ] #2 Walk the dog

tasks toggle 1
# Toggled: Buy milk (done)

tasks list
# [ ] #2 Walk the dog

tasks list --all
# [x] #1 Buy milk
# [ ] #2 Walk the dog

tasks toggle 1
# Toggled: Buy milk (pending)

tasks clear
# Cleared all tasks.
```

The tasks persist to `tasks.json`:

```json
[
  { "id": 1, "text": "Buy milk", "done": true },
  { "id": 2, "text": "Walk the dog", "done": false }
]
```

## Summary

| Concept | API |
|---------|-----|
| Define command | `Command.make(name, config, handler)` |
| Positional args | `Args.text`, `Args.integer`, `Args.optional`, `Args.repeated` |
| Named options | `Options.boolean`, `Options.text`, `Options.choice` |
| Option alias | `Options.withAlias("v")` |
| Descriptions | `Args.withDescription`, `Options.withDescription`, `Command.withDescription` |
| Subcommands | `Command.withSubcommands([...])` |
| Run CLI | `Command.run(cmd, { name, version })` |
| Platform layer | `BunContext.layer` or `NodeContext.layer` |

For the full API, see the [@effect/cli documentation](https://effect-ts.github.io/effect/docs/cli).

## Miscellaneous

### Version from package.json

Import your version from `package.json` to keep it in sync with your published package:

```typescript
import { Command } from "@effect/cli"
import pkg from "./package.json" with { type: "json" }

// hide-start
const app = Command.make("tasks")
// hide-end

const cli = Command.run(app, {
  name: "tasks",
  version: pkg.version
})
```

Requires `"resolveJsonModule": true` in tsconfig.
