import { spawn } from "bun";
import { Context, Effect, Layer, Schema } from "effect";

export const OpenIssueCategory = Schema.Literal(
  "Topic Request",
  "Fix",
  "Improvement",
);
export type OpenIssueCategory = typeof OpenIssueCategory.Type;

class BrowserOpenError extends Schema.TaggedError<BrowserOpenError>()(
  "BrowserOpenError",
  {
    url: Schema.String,
    cause: Schema.Defect,
  },
) {}

export class BrowserService extends Context.Tag("@cli/BrowserService")<
  BrowserService,
  {
    readonly open: (url: string) => Effect.Effect<void, BrowserOpenError>;
  }
>() {
  static readonly layer = Layer.sync(BrowserService, () => {
    const open = Effect.fn("BrowserService.open")((url: string) =>
      Effect.try({
        try: () => {
          const platform = process.platform;
          let command: string[];

          if (platform === "darwin") {
            command = ["open", url];
          } else if (platform === "win32") {
            command = ["cmd", "/c", "start", "", url];
          } else {
            command = ["xdg-open", url];
          }

          const child = spawn(command, {
            stdout: "ignore",
            stderr: "ignore",
          });
          void child.exited;
        },
        catch: (error) =>
          BrowserOpenError.make({
            url,
            cause: error,
          }),
      }),
    );

    return BrowserService.of({ open });
  });

  static readonly testLayer = Layer.sync(BrowserService, () => {
    const urls: string[] = [];

    const open = Effect.fn("BrowserService.open.test")((url: string) =>
      Effect.sync(() => {
        urls.push(url);
      }),
    );

    return BrowserService.of({ open });
  });

  static readonly noopLayer = Layer.sync(BrowserService, () => {
    const open = Effect.fn("BrowserService.open.noop")(
      (_url: string) => Effect.void,
    );

    return BrowserService.of({ open });
  });
}

export type OpenIssueInput = {
  category?: OpenIssueCategory;
  title?: string;
  description?: string;
};

export type OpenIssueResult = {
  issueUrl: string;
};

export class IssueService extends Context.Tag("@cli/IssueService")<
  IssueService,
  {
    readonly open: (
      input: OpenIssueInput,
    ) => Effect.Effect<OpenIssueResult, BrowserOpenError>;
  }
>() {
  static readonly layer = Effect.gen(function* () {
    const browser = yield* BrowserService;

    const open = Effect.fn("IssueService.open")(function* (
      input: OpenIssueInput,
    ) {
      const repoUrl = "https://github.com/kitlangton/effect-solutions";

      if (!input.category && !input.title && !input.description) {
        const issueUrl = `${repoUrl}/issues/new`;
        yield* browser.open(issueUrl);
        return { issueUrl };
      }

      const fullTitle =
        input.category && input.title
          ? `[${input.category}] ${input.title}`
          : input.title || "";
      const body = input.description
        ? `## Description\n\n${input.description}\n\n---\n*Created via [Effect Solutions CLI](${repoUrl})*`
        : `---\n*Created via [Effect Solutions CLI](${repoUrl})*`;

      const params = new URLSearchParams();
      if (fullTitle) params.set("title", fullTitle);
      if (body) params.set("body", body);

      const issueUrl = `${repoUrl}/issues/new?${params.toString()}`;
      yield* browser.open(issueUrl);

      return { issueUrl };
    });

    return IssueService.of({ open });
  }).pipe(Layer.effect(IssueService));
}
