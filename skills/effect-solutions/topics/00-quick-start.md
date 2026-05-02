---
title: Quick Start
description: "How to get started with Effect Solutions"
order: 0
group: Setup
---

# Quick Start

This is a field manual for Effect. It is neither exhaustive nor encyclopedic (see the [official docs](https://effect.website) for that). Instead, you will find a set of patterns and "best practices" for writing idiomatic Effect code.

We **highly recommend** that you follow the agent-guided setup below.

## Agent-Guided Setup

Copy the instructions below and paste them into your agent (`claude`, `codex`, `opencode`, etc.). 

<div className="flex justify-center my-8">
  <LLMInstructionsButton />
</div>

Your agent will guide you through setting up your repository with Effect best practices.

- Setting up the [Effect Language Service](https://github.com/Effect-TS/language-service)
- Installing our `effect-solutions` cli
- Refining your [TypeScript configuration](./02-tsconfig.md)
- Cloning the Effect repository to use as reference

---

## CLI

These docs are also available from the command line, which is especially useful for your agent. This is included in the setup step above.

```bash
bun add -g effect-solutions@latest
```

```bash
# List all topics
effect-solutions list

# Show specific topics
effect-solutions show project-setup tsconfig

# Leave feedback
effect-solutions open-issue
```
