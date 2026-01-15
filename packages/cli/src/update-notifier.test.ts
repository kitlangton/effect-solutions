import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Effect, Layer } from "effect";
import { UpdateNotifier, UpdateNotifierConfig } from "./update-notifier";

const pkgName = "effect-solutions";

const _readCache = async (home: string) => {
  const file = path.join(home, ".config", pkgName, "update.json");
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw) as { latest: string; nextCheck: number };
};

describe("maybeNotifyUpdate (effect)", () => {
  let originalHome: string;
  let originalNodeEnv: string | undefined;
  let tmpHome: string;
  let logs: Array<string>;
  const originalConsoleLog = console.log;

  const cachePath = (home: string) =>
    path.join(home, ".config", pkgName, "update.json");

  beforeEach(async () => {
    originalHome = process.env.HOME ?? os.homedir();
    originalNodeEnv = process.env.NODE_ENV;
    tmpHome = await mkdtemp(path.join(os.tmpdir(), "effect-solutions-test-"));
    process.env.HOME = tmpHome;
    process.env.NODE_ENV = "development";

    logs = [];
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "));
    };
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    delete process.env.CI;
    console.log = originalConsoleLog;
    await rm(tmpHome, { recursive: true, force: true }).catch(() => {});
  });

  test("emits hint when cache says newer version", async () => {
    const nextWeek = Date.now() + 1000 * 60 * 60 * 24 * 7;
    await mkdir(path.dirname(cachePath(tmpHome)), { recursive: true });
    await writeFile(
      cachePath(tmpHome),
      JSON.stringify({ latest: "9.9.9", nextCheck: nextWeek }),
      "utf8",
    );

    const testConfigLayer = Layer.succeed(UpdateNotifierConfig, {
      checkInterval: 1000 * 60 * 60 * 24,
      timeout: 3000,
      isCi: false,
      homeDir: tmpHome,
    });

    const program = Effect.gen(function* () {
      const notifier = yield* UpdateNotifier;
      yield* notifier.check(pkgName, "1.0.0");
    });

    await Effect.runPromise(
      program.pipe(
        Effect.provide(UpdateNotifier.layer),
        Effect.provide(testConfigLayer),
      ),
    );

    expect(logs.join("\n")).toContain("1.0.0 → 9.9.9");
    expect(logs.join("\n")).toContain("bun add -g effect-solutions@latest");
  });

  test("does nothing when already latest in cache", async () => {
    const nextWeek = Date.now() + 1000 * 60 * 60 * 24 * 7;
    await mkdir(path.dirname(cachePath(tmpHome)), { recursive: true });
    await writeFile(
      cachePath(tmpHome),
      JSON.stringify({ latest: "1.0.0", nextCheck: nextWeek }),
      "utf8",
    );

    const testConfigLayer = Layer.succeed(UpdateNotifierConfig, {
      checkInterval: 1000 * 60 * 60 * 24,
      timeout: 3000,
      isCi: false,
      homeDir: tmpHome,
    });

    const program = Effect.gen(function* () {
      const notifier = yield* UpdateNotifier;
      yield* notifier.check(pkgName, "1.0.0");
    });

    await Effect.runPromise(
      program.pipe(
        Effect.provide(UpdateNotifier.layer),
        Effect.provide(testConfigLayer),
      ),
    );

    expect(logs).toHaveLength(0);
  });

  test("skips entirely in CI", async () => {
    process.env.CI = "true";
    const nextWeek = Date.now() + 1000 * 60 * 60 * 24 * 7;
    await mkdir(path.dirname(cachePath(tmpHome)), { recursive: true });
    await writeFile(
      cachePath(tmpHome),
      JSON.stringify({ latest: "9.9.9", nextCheck: nextWeek }),
      "utf8",
    );

    const testConfigLayer = Layer.succeed(UpdateNotifierConfig, {
      checkInterval: 1000 * 60 * 60 * 24,
      timeout: 3000,
      isCi: true,
      homeDir: tmpHome,
    });

    const program = Effect.gen(function* () {
      const notifier = yield* UpdateNotifier;
      yield* notifier.check(pkgName, "1.0.0");
    });

    await Effect.runPromise(
      program.pipe(
        Effect.provide(UpdateNotifier.layer),
        Effect.provide(testConfigLayer),
      ),
    );

    expect(logs).toHaveLength(0);
  });

  test("does not notify when current version is newer than cached", async () => {
    const nextWeek = Date.now() + 1000 * 60 * 60 * 24 * 7;
    await mkdir(path.dirname(cachePath(tmpHome)), { recursive: true });
    await writeFile(
      cachePath(tmpHome),
      JSON.stringify({ latest: "0.2.4", nextCheck: nextWeek }),
      "utf8",
    );

    const testConfigLayer = Layer.succeed(UpdateNotifierConfig, {
      checkInterval: 1000 * 60 * 60 * 24,
      timeout: 3000,
      isCi: false,
      homeDir: tmpHome,
    });

    const program = Effect.gen(function* () {
      const notifier = yield* UpdateNotifier;
      yield* notifier.check(pkgName, "0.3.1");
    });

    await Effect.runPromise(
      program.pipe(
        Effect.provide(UpdateNotifier.layer),
        Effect.provide(testConfigLayer),
      ),
    );

    expect(logs).toHaveLength(0);
  });

  // Note: we intentionally avoid mocking fetch because the Effect runtime expects a real Fetch implementation.
});

describe("version comparison", () => {
  const isNewer = (latest: string, current: string): boolean => {
    const parseParts = (v: string) =>
      v.split(".").map((x) => Number.parseInt(x, 10) || 0);

    const [latestMajor = 0, latestMinor = 0, latestPatch = 0] =
      parseParts(latest);
    const [currentMajor = 0, currentMinor = 0, currentPatch = 0] =
      parseParts(current);

    if (latestMajor !== currentMajor) return latestMajor > currentMajor;
    if (latestMinor !== currentMinor) return latestMinor > currentMinor;
    return latestPatch > currentPatch;
  };

  test("returns true when major version is newer", () => {
    expect(isNewer("2.0.0", "1.0.0")).toBe(true);
    expect(isNewer("1.0.0", "2.0.0")).toBe(false);
  });

  test("returns true when minor version is newer", () => {
    expect(isNewer("1.2.0", "1.1.0")).toBe(true);
    expect(isNewer("1.1.0", "1.2.0")).toBe(false);
  });

  test("returns true when patch version is newer", () => {
    expect(isNewer("1.0.2", "1.0.1")).toBe(true);
    expect(isNewer("1.0.1", "1.0.2")).toBe(false);
  });

  test("returns false when versions are equal", () => {
    expect(isNewer("1.0.0", "1.0.0")).toBe(false);
  });

  test("handles the 0.3.1 vs 0.2.4 case correctly", () => {
    expect(isNewer("0.2.4", "0.3.1")).toBe(false);
    expect(isNewer("0.3.1", "0.2.4")).toBe(true);
  });

  test("handles multi-digit version parts", () => {
    expect(isNewer("1.10.0", "1.9.0")).toBe(true);
    expect(isNewer("1.9.0", "1.10.0")).toBe(false);
  });
});
