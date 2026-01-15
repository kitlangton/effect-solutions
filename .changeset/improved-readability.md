---
"@effect-best-practices/website": patch
---

improved readability

1. Refactored `Layer.effect` calls to reduce nesting. Changed from this

   ```typescript
   Layer.effect(
     Service,
     Effect.gen(function* () {
       // ...
     })
   )
   ```

   to this

   ```typescript
   Effect.gen(function* () {
     // ...
   }).pipe(Layer.effect(Service))
   ```

2. Changed a few `Effect.fn` function definitions to reduce nesting. Changed from this

   ```typescript
   const fn = Effect.fn("fn name")((...args: any[]) =>
     Effect.gen(function* () {
       // ...
     })
   )
   ```

   to this

   ```typescript
   const fn = Effect.fn("fn name")(function* (...args: any[]) {
     // ...
   })
   ```

3. Removed unnecessary `Tag.of` calls directly inside `Layer.succeed` arguments. Changed from this

   ```typescript
   const Tag1Live = Layer.succeed(
     Tag1,
     Tag1.of({
       // ...
     })
   );
   ```

   to this

   ```typescript
   const Tag1Live = Layer.succeed(Tag1, {
     // ...
   });
   ```

4. Added some missing `Tag1.of` calls
5. Other improvements
