---
title: Incremental Adoption
description: "Strategies for gradually introducing Effect into existing codebases"
order: 10
draft: true
---

# Incremental Adoption

## Proposed Outline

### 1. Promise Interop
- `Effect.tryPromise` / `Effect.promise` for wrapping
- `Effect.runPromise` / `Effect.runPromiseExit` for running
- Quick reference table

### 2. Where to Start
- New features (greenfield)
- Error-prone code paths
- API/service boundaries
- NOT: hot paths, stable code, tight deadlines

### 3. Wrapping External Libraries
- Single example: callback-based → Effect service
- Pattern: Tag + Layer.succeed/Layer.effect

### 4. Framework Integration
- Express/Fastify route handlers
- Next.js API routes / Server Actions
- One example each, minimal

### 5. Gradual Service Introduction
- Start with plain functions
- When to upgrade to services (DI, shared state, composition)

### 6. Resources
- Inato migration story
- Effect docs links

---

What angle do you want? Options:
- **Practical cookbook**: Concrete recipes for common scenarios
- **Decision guide**: When/where/how to introduce Effect
- **Migration playbook**: Step-by-step for converting existing code
