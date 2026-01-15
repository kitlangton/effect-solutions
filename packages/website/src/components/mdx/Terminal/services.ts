import * as FileSystem from "@effect/platform/FileSystem";
import { KeyValueStore } from "@effect/platform/KeyValueStore";
import * as Path from "@effect/platform/Path";
import { Terminal } from "@effect/platform/Terminal";
import { BrowserKeyValueStore } from "@effect/platform-browser";
import {
  Console,
  Context,
  Effect,
  Layer,
  ManagedRuntime,
  Option,
  Ref,
} from "effect";
import { Task, TaskId, TaskList, TaskRepo } from "./domain";

// =============================================================================
// Browser TaskRepo (KeyValueStore)
// =============================================================================

const STORAGE_KEY = "effect-solutions-tasks-demo";
const INITIALIZED_KEY = "effect-solutions-tasks-initialized";

const DEFAULT_TASKS = TaskList.make({
  tasks: [
    Task.make({
      id: TaskId.make(1),
      text: "Run the agent-guided setup",
      done: false,
    }),
    Task.make({
      id: TaskId.make(2),
      text: "Become effect-pilled",
      done: false,
    }),
  ],
});

const browserTaskRepoLayer = Effect.gen(function* () {
  const kv = (yield* KeyValueStore).forSchema(TaskList);

  const loadTaskList = Effect.gen(function* () {
    const initialized = yield* kv.has(INITIALIZED_KEY);
    if (!initialized) {
      yield* kv.set(INITIALIZED_KEY, TaskList.empty);
      yield* kv.set(STORAGE_KEY, DEFAULT_TASKS);
      return DEFAULT_TASKS;
    }
    const stored = yield* kv.get(STORAGE_KEY);
    return Option.getOrElse(stored, () => TaskList.empty);
  }).pipe(Effect.orElseSucceed(() => TaskList.empty));

  const saveTaskList = (list: TaskList) =>
    kv.set(STORAGE_KEY, list).pipe(Effect.ignore);

  return TaskRepo.of({
    list: Effect.fn("TaskRepo.list")(function* (all?: boolean) {
      const taskList = yield* loadTaskList;
      return all ? taskList.tasks : taskList.tasks.filter((t) => !t.done);
    }),
    add: Effect.fn("TaskRepo.add")(function* (text: string) {
      const list = yield* loadTaskList;
      const [newList, task] = list.add(text);
      yield* saveTaskList(newList);
      return task;
    }),
    toggle: Effect.fn("TaskRepo.toggle")(function* (id: TaskId) {
      const list = yield* loadTaskList;
      const [newList, task] = list.toggle(id);
      yield* saveTaskList(newList);
      return task;
    }),
    clear: Effect.fn("TaskRepo.clear")(function* () {
      yield* saveTaskList(TaskList.empty);
    }),
  });
}).pipe(
  Layer.effect(TaskRepo),
  Layer.provide(BrowserKeyValueStore.layerLocalStorage),
);

// =============================================================================
// Terminal Output Service (line accumulator)
// =============================================================================

export class TerminalOutput extends Context.Tag("TerminalOutput")<
  TerminalOutput,
  {
    readonly log: (...args: ReadonlyArray<unknown>) => Effect.Effect<void>;
    readonly getLines: Effect.Effect<ReadonlyArray<string>>;
  }
>() {}

export const TerminalOutputLive = Effect.gen(function* () {
  const lines = yield* Ref.make<string[]>([]);
  return TerminalOutput.of({
    log: (...args) => Ref.update(lines, (l) => [...l, ...args.map(String)]),
    getLines: Ref.get(lines),
  });
}).pipe(Layer.effect(TerminalOutput));

// Helper to log to TerminalOutput
export const log = (...args: ReadonlyArray<unknown>) =>
  Effect.flatMap(TerminalOutput, (out) => out.log(...args));

// =============================================================================
// Mock Platform Services (minimal browser stubs)
// =============================================================================

// Terminal mock - display goes to our TerminalOutput accumulator
export const MockTerminalLayer = Effect.gen(function* () {
  const output = yield* TerminalOutput;
  return Terminal.of({
    columns: Effect.succeed(80),
    display: (text: string) => output.log(text),
    readLine: Effect.die("readLine not implemented in browser"),
    readInput: Effect.die("readInput not implemented in browser"),
  });
}).pipe(Layer.effect(Terminal));

// Console mock - @effect/cli uses Console.log/error for help and error output
// Must use Console.setConsole to properly override the default console
const noop = () => Effect.void;
export const makeMockConsole = Effect.map(TerminalOutput, (output) =>
  Console.Console.of({
    [Console.TypeId]: Console.TypeId,
    log: (...args) => output.log(...args),
    error: (...args) => output.log(...args),
    assert: noop,
    clear: Effect.void,
    count: noop,
    countReset: noop,
    debug: noop,
    dir: noop,
    dirxml: noop,
    group: noop,
    groupEnd: Effect.void,
    info: noop,
    table: noop,
    time: noop,
    timeEnd: noop,
    timeLog: noop,
    trace: noop,
    warn: noop,
    unsafe: globalThis.console,
  }),
);

// FileSystem.layerNoop provides a no-op FileSystem where all operations fail by default
const mockFileSystemLayer = FileSystem.layerNoop({});

// Path.layer is a built-in cross-platform Path implementation that works in browsers
const mockPathLayer = Path.layer;

// Combined browser platform layer (without Terminal - that needs TerminalOutput)
const browserPlatformLayer = Layer.mergeAll(mockFileSystemLayer, mockPathLayer);

// Combined layer for all browser services
const browserLiveLayer = Layer.mergeAll(
  browserPlatformLayer,
  browserTaskRepoLayer,
);

// Managed runtime with all browser services baked in
export const BrowserRuntime = ManagedRuntime.make(browserLiveLayer);

export { INITIALIZED_KEY, STORAGE_KEY };
