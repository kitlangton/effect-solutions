---
title: Observability & OpenTelemetry
description: "Wire logs, spans, and metrics with @effect/opentelemetry"
order: 12
draft: true
---

# Observability & OpenTelemetry (Draft)

Effect ships first-class tracing and logging; `@effect/opentelemetry` exports a single layer that forwards everything to OTLP (any vendor that speaks OTLP HTTP or gRPC).

## Install

```bash
bun add @effect/opentelemetry effect@beta @opentelemetry/api
```

## Send traces + logs to OTLP

```typescript
import { Effect, Layer } from "effect"
import { BunHttpServer } from "@effect/platform-bun/HttpServer"
import { HttpServerResponse, FetchHttpClient } from "effect/unstable/http"
import { Otlp, Tracer } from "@effect/opentelemetry"

const otelLayer = Otlp.layer({
  baseUrl: "https://otel-collector.company.dev",
  resource: { serviceName: "effect-app", serviceVersion: "0.1.0" }
}).pipe(
  Layer.provide(FetchHttpClient.layer) // HTTP export
)

const app = HttpServerResponse.text("ok").pipe(
  Effect.withSpan("http.request")
)

Effect.runPromise(
  BunHttpServer.serve(app, { port: 3000 }).pipe(
    Tracer.withSpan("server"),
    Effect.provide(otelLayer)
  )
)
```

### Tips

- Use `Effect.withSpan("name")` or `Effect.tapErrorTag` to attach more detail to each request.
- `Tracer.withSpanContext` lets you continue spans created outside Effect (e.g., manual OpenTelemetry instrumentation).
- To merge logs with traces, pass `loggerExportInterval`/`loggerExcludeLogSpans` options to `Otlp.layer` or pipe `Effect.log` statements inside spans.

## Custom spans inside services

```typescript
import { Effect } from "effect"

const performDbLookup = Effect.gen(function* () {
  yield* Effect.sleep("50 millis").pipe(Effect.withSpan("db.lookup"))
  return { data: "result" }
})

const fetchData = Effect.fn("fetchData")(function* () {
  yield* Effect.log("Fetching data")
  return yield* performDbLookup
})
```

Span attributes show up in your tracing backend, making it easy to aggregate latency per service or per customer.
