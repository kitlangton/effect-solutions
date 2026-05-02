---
title: HTTP Clients
description: "Build typed REST clients with Effect's HTTP module and Schema"
order: 11
group: Ecosystem
draft: true
---

# HTTP Clients

Effect provides a typed HTTP client that integrates with Schema for request/response validation. This guide covers the patterns you'll use most often.

## Minimal Example

Fetch a GitHub repository and decode with Schema:

```typescript
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Effect, Schema } from "effect"

const Repo = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  full_name: Schema.String,
  stargazers_count: Schema.Number,
})

const program = Effect.gen(function* () {
  const response = yield* HttpClient.get("https://api.github.com/repos/Effect-TS/effect")
  const repo = yield* HttpClientResponse.schemaBodyJson(Repo)(response)
  console.log(`${repo.full_name}: ${repo.stargazers_count} stars`)
})

program.pipe(Effect.provide(FetchHttpClient.layer), Effect.runPromise)
```

Key points:
- `HttpClient.get` returns an `Effect` requiring `HttpClient` in context
- `HttpClientResponse.schemaBodyJson` decodes and validates the JSON body
- `FetchHttpClient.layer` provides the `HttpClient` implementation using `fetch`

## Building Requests

`HttpClientRequest` provides builders for headers, query params, and body.

### Headers

```typescript
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { Effect, Schema } from "effect"

// hide-start
const Repo = Schema.Struct({ id: Schema.Number, name: Schema.String })
// hide-end

const program = Effect.gen(function* () {
  const request = HttpClientRequest.get("https://api.github.com/repos/Effect-TS/effect").pipe(
    HttpClientRequest.setHeader("Accept", "application/vnd.github.v3+json"),
    HttpClientRequest.bearerToken("ghp_xxxx") // For authenticated requests
  )
  const response = yield* HttpClient.execute(request)
  return yield* HttpClientResponse.schemaBodyJson(Repo)(response)
})

program.pipe(Effect.provide(FetchHttpClient.layer), Effect.runPromise)
```

Common header helpers:
- `HttpClientRequest.setHeader(key, value)` - Set any header
- `HttpClientRequest.setHeaders(record)` - Set multiple headers
- `HttpClientRequest.bearerToken(token)` - Set `Authorization: Bearer <token>`
- `HttpClientRequest.basicAuth(user, pass)` - Set basic auth header
- `HttpClientRequest.acceptJson` - Set `Accept: application/json`

### Query Parameters

```typescript
import { HttpClientRequest } from "effect/unstable/http"

const request = HttpClientRequest.get("https://api.github.com/search/repositories").pipe(
  HttpClientRequest.setUrlParam("q", "effect language:typescript"),
  HttpClientRequest.setUrlParam("sort", "stars")
)
```

### Request Body

For requests with JSON body, use `HttpClientRequest.schemaBodyJson`. It returns an Effect because encoding can fail:

```typescript
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { Effect, Schema } from "effect"

const CreateIssue = Schema.Struct({
  title: Schema.String,
  body: Schema.String,
})

const Issue = Schema.Struct({
  id: Schema.Number,
  number: Schema.Number,
  title: Schema.String,
})

const createIssue = Effect.fn("createIssue")(function* (
  owner: string,
  repo: string,
  data: typeof CreateIssue.Type
) {
  const request = yield* HttpClientRequest.post(`https://api.github.com/repos/${owner}/${repo}/issues`).pipe(
    HttpClientRequest.schemaBodyJson(CreateIssue)(data)
  )
  const response = yield* HttpClient.execute(request)
  return yield* HttpClientResponse.schemaBodyJson(Issue)(response)
})

createIssue("my-org", "my-repo", { title: "Bug", body: "Description" }).pipe(
  Effect.provide(FetchHttpClient.layer),
  Effect.runPromise
)
```

## Response Decoding

### Decode JSON Body

The most common pattern. Fails if the response isn't valid JSON or doesn't match the schema:

```typescript
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Effect, Schema } from "effect"

const User = Schema.Struct({
  id: Schema.Number,
  login: Schema.String,
})

const program = Effect.gen(function* () {
  const response = yield* HttpClient.get("https://api.github.com/users/effect-ts")
  return yield* HttpClientResponse.schemaBodyJson(User)(response)
})

program.pipe(Effect.provide(FetchHttpClient.layer), Effect.runPromise)
```

### Handle Different Status Codes

Use `matchStatus` to handle success and error cases differently:

```typescript
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Effect, Schema } from "effect"

const User = Schema.Struct({
  id: Schema.Number,
  login: Schema.String,
})

class UserNotFound {
  readonly _tag = "UserNotFound"
  constructor(readonly username: string) {}
}

const getUser = Effect.fn("getUser")(function* (username: string) {
  const response = yield* HttpClient.get(`https://api.github.com/users/${username}`)
  return yield* HttpClientResponse.matchStatus(response, {
    "2xx": HttpClientResponse.schemaBodyJson(User),
    404: () => Effect.fail(new UserNotFound(username)),
    orElse: (r) => Effect.fail(new Error(`Unexpected status: ${r.status}`)),
  })
})

getUser("effect-ts").pipe(Effect.provide(FetchHttpClient.layer), Effect.runPromise)
```

### Filter Status OK

For simple cases where you just want to fail on non-2xx:

```typescript
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Effect, Schema } from "effect"

// hide-start
const User = Schema.Struct({ id: Schema.Number, login: Schema.String })
// hide-end

const program = Effect.gen(function* () {
  const response = yield* HttpClient.get("https://api.github.com/users/effect-ts")
  yield* HttpClientResponse.filterStatusOk(response)
  return yield* HttpClientResponse.schemaBodyJson(User)(response)
})

program.pipe(Effect.provide(FetchHttpClient.layer), Effect.runPromise)
```

## Worked Example: GitHub API Client

Let's build a typed client for the GitHub API. This demonstrates the service pattern you'd use for real APIs.

### The Schemas

```typescript
import { Schema } from "effect"

const UserId = Schema.Number.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

const RepoId = Schema.Number.pipe(Schema.brand("RepoId"))
type RepoId = typeof RepoId.Type

class User extends Schema.Class<User>("User")({
  id: UserId,
  login: Schema.String,
  name: Schema.NullOr(Schema.String),
  public_repos: Schema.Number,
}) {}

class Repo extends Schema.Class<Repo>("Repo")({
  id: RepoId,
  name: Schema.String,
  full_name: Schema.String,
  stargazers_count: Schema.Number,
  language: Schema.NullOr(Schema.String),
}) {}
```

### The API Service

```typescript
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { Effect, Layer, Schema } from "effect"
import * as Context from "effect/Context"

// hide-start
const UserId = Schema.Number.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

const RepoId = Schema.Number.pipe(Schema.brand("RepoId"))
type RepoId = typeof RepoId.Type

class User extends Schema.Class<User>("User")({
  id: UserId,
  login: Schema.String,
  name: Schema.NullOr(Schema.String),
  public_repos: Schema.Number,
}) {}

class Repo extends Schema.Class<Repo>("Repo")({
  id: RepoId,
  name: Schema.String,
  full_name: Schema.String,
  stargazers_count: Schema.Number,
  language: Schema.NullOr(Schema.String),
}) {}
// hide-end

class GitHubApi extends Context.Service<
  GitHubApi,
  {
    readonly getUser: (username: string) => Effect.Effect<User, unknown>
    readonly getRepo: (owner: string, repo: string) => Effect.Effect<Repo, unknown>
    readonly listRepos: (username: string) => Effect.Effect<ReadonlyArray<Repo>, unknown>
  }
>()("GitHubApi") {
  static layer = Layer.effect(
    GitHubApi,
    Effect.gen(function* () {
      const baseClient = yield* HttpClient.HttpClient
      const client = baseClient.pipe(
        HttpClient.mapRequest(HttpClientRequest.prependUrl("https://api.github.com"))
      )

      const getUser = Effect.fn("GitHubApi.getUser")(function* (username: string) {
        const response = yield* client.get(`/users/${username}`)
        return yield* HttpClientResponse.schemaBodyJson(User)(response)
      })

      const getRepo = Effect.fn("GitHubApi.getRepo")(function* (owner: string, repo: string) {
        const response = yield* client.get(`/repos/${owner}/${repo}`)
        return yield* HttpClientResponse.schemaBodyJson(Repo)(response)
      })

      const listRepos = Effect.fn("GitHubApi.listRepos")(function* (username: string) {
        const response = yield* client.get(`/users/${username}/repos`)
        return yield* HttpClientResponse.schemaBodyJson(Schema.Array(Repo))(response)
      })

      return { getUser, getRepo, listRepos }
    })
  )

  static live = GitHubApi.layer.pipe(Layer.provide(FetchHttpClient.layer))
}
```

### Using the API

```typescript
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { Effect, Layer, Schema } from "effect"
import * as Context from "effect/Context"

// hide-start
const UserId = Schema.Number.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

const RepoId = Schema.Number.pipe(Schema.brand("RepoId"))
type RepoId = typeof RepoId.Type

class User extends Schema.Class<User>("User")({
  id: UserId,
  login: Schema.String,
  name: Schema.NullOr(Schema.String),
  public_repos: Schema.Number,
}) {}

class Repo extends Schema.Class<Repo>("Repo")({
  id: RepoId,
  name: Schema.String,
  full_name: Schema.String,
  stargazers_count: Schema.Number,
  language: Schema.NullOr(Schema.String),
}) {}

class GitHubApi extends Context.Service<
  GitHubApi,
  {
    readonly getUser: (username: string) => Effect.Effect<User, unknown>
    readonly getRepo: (owner: string, repo: string) => Effect.Effect<Repo, unknown>
    readonly listRepos: (username: string) => Effect.Effect<ReadonlyArray<Repo>, unknown>
  }
>()("GitHubApi") {
  static layer = Layer.effect(
    GitHubApi,
    Effect.gen(function* () {
      const baseClient = yield* HttpClient.HttpClient
      const client = baseClient.pipe(
        HttpClient.mapRequest(HttpClientRequest.prependUrl("https://api.github.com"))
      )

      const getUser = Effect.fn("GitHubApi.getUser")(function* (username: string) {
        const response = yield* client.get(`/users/${username}`)
        return yield* HttpClientResponse.schemaBodyJson(User)(response)
      })

      const getRepo = Effect.fn("GitHubApi.getRepo")(function* (owner: string, repo: string) {
        const response = yield* client.get(`/repos/${owner}/${repo}`)
        return yield* HttpClientResponse.schemaBodyJson(Repo)(response)
      })

      const listRepos = Effect.fn("GitHubApi.listRepos")(function* (username: string) {
        const response = yield* client.get(`/users/${username}/repos`)
        return yield* HttpClientResponse.schemaBodyJson(Schema.Array(Repo))(response)
      })

      return { getUser, getRepo, listRepos }
    })
  )

  static live = GitHubApi.layer.pipe(Layer.provide(FetchHttpClient.layer))
}
// hide-end

const program = Effect.gen(function* () {
  const github = yield* GitHubApi

  const user = yield* github.getUser("effect-ts")
  console.log(`${user.login} has ${user.public_repos} public repos`)

  const repo = yield* github.getRepo("Effect-TS", "effect")
  console.log(`${repo.full_name}: ${repo.stargazers_count} stars`)

  const repos = yield* github.listRepos("effect-ts")
  console.log(`First 3 repos: ${repos.slice(0, 3).map((r) => r.name).join(", ")}`)
})

program.pipe(Effect.provide(GitHubApi.live), Effect.runPromise)
```

## Client Middleware

Use `HttpClient.mapRequest` to apply transformations to all requests.

### Base URL and Authentication

```typescript
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"
import { Effect, flow, Layer } from "effect"

const GitHubClient = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const baseClient = yield* HttpClient.HttpClient
    return baseClient.pipe(
      HttpClient.mapRequest(
        flow(
          HttpClientRequest.prependUrl("https://api.github.com"),
          HttpClientRequest.bearerToken("ghp_xxxx"),
          HttpClientRequest.setHeader("Accept", "application/vnd.github.v3+json")
        )
      )
    )
  })
).pipe(Layer.provide(FetchHttpClient.layer))
```

## Error Handling

HTTP client operations can fail with `HttpClientError`:

```typescript
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Effect, Schema } from "effect"

// hide-start
const Repo = Schema.Struct({ id: Schema.Number, name: Schema.String })
// hide-end

const program = Effect.gen(function* () {
  const response = yield* HttpClient.get("https://api.github.com/repos/Effect-TS/effect")
  return yield* HttpClientResponse.schemaBodyJson(Repo)(response)
}).pipe(
  Effect.catchTag("RequestError", (e) =>
    Effect.fail(`Network error: ${e.reason}`)
  ),
  Effect.catchTag("ResponseError", (e) =>
    Effect.fail(`HTTP ${e.response.status}: ${e.reason}`)
  )
)

program.pipe(Effect.provide(FetchHttpClient.layer), Effect.runPromise)
```

Error types:
- `RequestError` - Network failures, DNS errors, timeouts
- `ResponseError` - Non-2xx status (when using `filterStatusOk`) or body parsing failures

## Retries

Use Effect's retry combinators:

```typescript
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Effect, Schedule, Schema } from "effect"

// hide-start
const Repo = Schema.Struct({ id: Schema.Number, name: Schema.String })
// hide-end

const getRepoWithRetry = Effect.gen(function* () {
  const response = yield* HttpClient.get("https://api.github.com/repos/Effect-TS/effect")
  return yield* HttpClientResponse.schemaBodyJson(Repo)(response)
}).pipe(
  Effect.retry(Schedule.exponential("100 millis").pipe(Schedule.both(Schedule.recurs(3))))
)

getRepoWithRetry.pipe(Effect.provide(FetchHttpClient.layer), Effect.runPromise)
```

For transient errors only (rate limiting, timeouts, 5xx), use `HttpClient.retryTransient`:

```typescript
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Effect, Layer, Schema } from "effect"

// hide-start
const Repo = Schema.Struct({ id: Schema.Number, name: Schema.String })
// hide-end

const ResilientClient = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    return client.pipe(HttpClient.retryTransient({ times: 3 }))
  })
).pipe(Layer.provide(FetchHttpClient.layer))

const getRepo = Effect.gen(function* () {
  const response = yield* HttpClient.get("https://api.github.com/repos/Effect-TS/effect")
  return yield* HttpClientResponse.schemaBodyJson(Repo)(response)
})

getRepo.pipe(Effect.provide(ResilientClient), Effect.runPromise)
```

## Summary

| Concept | API |
|---------|-----|
| Simple GET | `HttpClient.get(url)` |
| Execute request | `HttpClient.execute(request)` |
| Build request | `HttpClientRequest.get`, `.post`, `.put`, `.patch`, `.del` |
| Set headers | `HttpClientRequest.setHeader`, `.bearerToken`, `.basicAuth` |
| Query params | `HttpClientRequest.setUrlParam`, `.setUrlParams` |
| JSON body | `HttpClientRequest.schemaBodyJson(Schema)(data)` |
| Decode response | `HttpClientResponse.schemaBodyJson(Schema)(response)` |
| Status matching | `HttpClientResponse.matchStatus(response, { ... })` |
| Filter 2xx | `HttpClientResponse.filterStatusOk(response)` |
| Base URL | `HttpClient.mapRequest(HttpClientRequest.prependUrl(url))` |
| Retry transient | `HttpClient.retryTransient({ times: 3 })` |
| Provide client | `Effect.provide(FetchHttpClient.layer)` |

For the full API, see the [Effect HTTP documentation](https://effect-ts.github.io/effect/docs/platform).
