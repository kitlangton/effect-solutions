import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Console, Context, Effect, Layer, Option, Schema } from "effect";

const CacheFile = Schema.Struct({
  latest: Schema.String,
  nextCheck: Schema.Number,
});
type CacheFile = typeof CacheFile.Type;

class UpdateCheckError extends Schema.TaggedError<UpdateCheckError>()(
  "UpdateCheckError",
  {
    cause: Schema.Defect,
  },
) {}

export class UpdateNotifier extends Context.Tag("@cli/UpdateNotifier")<
  UpdateNotifier,
  {
    readonly check: (
      pkgName: string,
      currentVersion: string,
    ) => Effect.Effect<void, UpdateCheckError>;
  }
>() {
  static readonly layer = Effect.gen(function* () {
    const config = yield* UpdateNotifierConfig;

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

    const cachePath = (pkgName: string) =>
      path.join(config.homeDir, ".config", pkgName, "update.json");

    const readCache = Effect.fn("UpdateNotifier.readCache")((file: string) =>
      Effect.tryPromise({
        try: () => readFile(file, "utf8"),
        catch: () => null,
      }).pipe(
        Effect.flatMap((raw) =>
          raw
            ? Effect.try({
                try: () => Option.some(JSON.parse(raw) as CacheFile),
                catch: () => Option.none<CacheFile>(),
              })
            : Effect.succeed(Option.none()),
        ),
        Effect.catchAll(() => Effect.succeed(Option.none())),
      ),
    );

    const writeCache = Effect.fn("UpdateNotifier.writeCache")(
      (file: string, data: CacheFile) =>
        Effect.tryPromise({
          try: async () => {
            await mkdir(path.dirname(file), { recursive: true });
            await writeFile(file, JSON.stringify(data), "utf8");
          },
          catch: () => {},
        }).pipe(Effect.catchAll(() => Effect.void)),
    );

    const fetchLatest = Effect.fn("UpdateNotifier.fetchLatest")(
      (pkgName: string) =>
        Effect.tryPromise({
          try: async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), config.timeout);
            try {
              const res = await fetch(
                `https://registry.npmjs.org/${encodeURIComponent(pkgName)}/latest`,
                { signal: controller.signal },
              );
              if (!res.ok) return Option.none<string>();
              const json = (await res.json()) as { version?: string };
              return json.version
                ? Option.some(json.version)
                : Option.none<string>();
            } finally {
              clearTimeout(timer);
            }
          },
          catch: () => Option.none<string>(),
        }).pipe(Effect.catchAll(() => Effect.succeed(Option.none()))),
    );

    const logUpdate = Effect.fn("UpdateNotifier.logUpdate")(
      (current: string, latest: string, pkgName: string) =>
        Console.log(
          [
            `Update available for ${pkgName}: ${current} → ${latest}`,
            `Run: bun add -g ${pkgName}@latest`,
          ].join("\n"),
        ),
    );

    const check = Effect.fn("UpdateNotifier.check")(
      function* (pkgName: string, currentVersion: string) {
        if (config.isCi) return;

        const now = Date.now();
        const file = cachePath(pkgName);

        const cache = yield* readCache(file);
        if (Option.isSome(cache)) {
          const cached = cache.value;
          if (cached.nextCheck > now) {
            if (isNewer(cached.latest, currentVersion)) {
              yield* logUpdate(currentVersion, cached.latest, pkgName);
            }
            return;
          }
        }

        const latest = yield* fetchLatest(pkgName);
        if (Option.isNone(latest)) return;

        const latestVersion = latest.value;
        yield* writeCache(file, {
          latest: latestVersion,
          nextCheck: now + config.checkInterval,
        });

        if (isNewer(latestVersion, currentVersion)) {
          yield* logUpdate(currentVersion, latestVersion, pkgName);
        }
      },
      Effect.catchAll(() => Effect.void),
    );

    return UpdateNotifier.of({ check });
  }).pipe(Layer.effect(UpdateNotifier));

  static readonly testLayer = Layer.succeed(UpdateNotifier, {
    check: (_pkgName, _currentVersion) => Effect.void,
  });
}

export class UpdateNotifierConfig extends Context.Tag(
  "@cli/UpdateNotifierConfig",
)<
  UpdateNotifierConfig,
  {
    readonly checkInterval: number;
    readonly timeout: number;
    readonly isCi: boolean;
    readonly homeDir: string;
  }
>() {
  static readonly layer = Layer.sync(UpdateNotifierConfig, () => {
    const isCi = Boolean(process.env.CI || process.env.NODE_ENV === "test");
    const homeDir = process.env.HOME ?? os.homedir();
    const checkInterval = 1000 * 60 * 60 * 24; // daily
    const timeout = 3_000;

    return UpdateNotifierConfig.of({
      checkInterval,
      timeout,
      isCi,
      homeDir,
    });
  });

  static readonly testLayer = Layer.succeed(UpdateNotifierConfig, {
    checkInterval: 100,
    timeout: 100,
    isCi: true,
    homeDir: "/tmp",
  });
}
