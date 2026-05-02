#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const BASE_DIR = import.meta.dir ?? fileURLToPath(new URL(".", import.meta.url))

const DOCS_DIR = join(BASE_DIR, "../skills/effect-solutions/topics")
const TEMP_DIR = join(BASE_DIR, "../.docs-typecheck")

type ExtractedBlock = {
  file: string
  startLine: number
  blockNumber: number
  lines: string[]
}

async function extractCodeBlocks(): Promise<ExtractedBlock[]> {
  const files = await readdir(DOCS_DIR)
  const mdFiles = files.filter((f) => f.endsWith(".md"))

  const allBlocks: ExtractedBlock[] = []

  for (const file of mdFiles) {
    const content = await readFile(join(DOCS_DIR, file), "utf-8")
    // Skip draft docs via frontmatter `draft: true`
    const fm = content.match(/^---\n([\s\S]*?)\n---/)
    if (fm && /draft:\s*true/.test(fm[1])) continue
    const lines = content.split("\n")

    let inCodeBlock = false
    let isTypeScriptBlock = false
    let currentBlock: string[] = []
    let blockNum = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (line.startsWith("```typescript") || line.startsWith("```ts")) {
        inCodeBlock = true
        isTypeScriptBlock = true
        currentBlock = []
      } else if (line.startsWith("```") && inCodeBlock) {
        if (isTypeScriptBlock && currentBlock.length > 0) {
          const firstNonEmpty = currentBlock.find((l) => l.trim() !== "")
          if (firstNonEmpty?.trim().startsWith("// typecheck:skip")) {
            inCodeBlock = false
            isTypeScriptBlock = false
            currentBlock = []
            continue
          }
          blockNum += 1
          allBlocks.push({
            file,
            startLine: i - currentBlock.length,
            blockNumber: blockNum,
            lines: currentBlock.slice(),
          })
        }
        inCodeBlock = false
        isTypeScriptBlock = false
        currentBlock = []
      } else if (inCodeBlock) {
        currentBlock.push(line)
      }
    }
  }

  return allBlocks
}

async function main() {
  console.log("Extracting TypeScript code blocks...")
  const blocks = await extractCodeBlocks()

  if (blocks.length === 0) {
    console.log("No TypeScript code blocks found")
    return
  }

  console.log(`Found ${blocks.length} TypeScript code blocks\n`)

  // Clean and create temp dir
  await rm(TEMP_DIR, { recursive: true, force: true })
  await mkdir(TEMP_DIR, { recursive: true })
  const TMP_SUBDIR = join(TEMP_DIR, ".tmp")
  await mkdir(TMP_SUBDIR, { recursive: true })

  // Shared prelude so snippets can rely on common imports without cluttering docs
  const prelude = `
import { Clock as _Clock, Config as _Config, Console as _Console, Context as _Context, Effect as _Effect, Layer as _Layer, Logger as _Logger, Match as _Match, Option as _Option, Redacted as _Redacted, Schema as _Schema } from "effect";
import { describe as _describe, expect as _expect, it as _it } from "@effect/vitest";
import { Argument as _Argument, Command as _Command, Flag as _Flag } from "effect/unstable/cli";
import { BunRuntime as _BunRuntime, BunServices as _BunServices } from "@effect/platform-bun";
declare global {
  const Clock: typeof _Clock;
  const Config: typeof _Config;
  const Console: typeof _Console;
  const Context: typeof _Context;
  const describe: typeof _describe;
  const Effect: typeof _Effect;
  const expect: typeof _expect;
  const it: typeof _it;
  const Layer: typeof _Layer;
  const Logger: typeof _Logger;
  const Match: typeof _Match;
  const Redacted: typeof _Redacted;
  const Schema: typeof _Schema;
  const Argument: typeof _Argument;
  const Command: typeof _Command;
  const Flag: typeof _Flag;
  const BunRuntime: typeof _BunRuntime;
  const BunServices: typeof _BunServices;
}
Object.assign(globalThis, {
  Clock: _Clock,
  Config: _Config,
  Console: _Console,
  Context: _Context,
  describe: _describe,
  Effect: _Effect,
  expect: _expect,
  it: _it,
  Layer: _Layer,
  Logger: _Logger,
  Match: _Match,
  Redacted: _Redacted,
  Schema: _Schema,
  Argument: _Argument,
  Command: _Command,
  Flag: _Flag,
  BunRuntime: _BunRuntime,
  BunServices: _BunServices,
});
export const __prelude = {
  Clock: _Clock,
  Config: _Config,
  Console: _Console,
  Context: _Context,
  describe: _describe,
  Effect: _Effect,
  expect: _expect,
  it: _it,
  Layer: _Layer,
  Logger: _Logger,
  Match: _Match,
  Redacted: _Redacted,
  Schema: _Schema,
  Argument: _Argument,
  Command: _Command,
  Flag: _Flag,
  BunRuntime: _BunRuntime,
  BunServices: _BunServices,
};
`
  await writeFile(join(TEMP_DIR, "prelude.ts"), prelude)

  // Write each block to its own module to avoid global name collisions
  await Promise.all(
    blocks.map((block) => {
      const base = block.file.replace(/\.md$/, "").replace(/[^a-zA-Z0-9_-]/g, "-")
      const filename = `${base}-block-${block.blockNumber.toString().padStart(3, "0")}.ts`
      const header = `// ${block.file}:${block.startLine} (block ${block.blockNumber})`
      const content = [header, 'import "./prelude";', "export {};", ...block.lines].join("\n")
      return writeFile(join(TEMP_DIR, filename), content)
    }),
  )

  // Create a minimal tsconfig for the temp dir
  const tsconfig = {
    extends: "../tsconfig.base.json",
    compilerOptions: {
      lib: ["ES2022", "DOM"],
      noEmit: true,
      skipLibCheck: true,
      // Ensure every snippet is treated as an isolated module
      moduleDetection: "force",
    },
    include: ["*.ts"],
  }
  await writeFile(join(TEMP_DIR, "tsconfig.json"), JSON.stringify(tsconfig, null, 2))

  // Run tsc
  console.log("Running TypeScript compiler...")
  const result = spawnSync("bunx", ["tsc", "-p", TEMP_DIR], {
    stdio: "inherit",
    env: {
      ...process.env,
      TMPDIR: TMP_SUBDIR,
      BUN_INSTALL_CACHE_DIR: TMP_SUBDIR,
    },
  })

  // Cleanup
  await rm(TEMP_DIR, { recursive: true, force: true })

  if (result.status !== 0) {
    process.exit(1)
  }

  console.log("\n✓ All code blocks typecheck successfully!")
}

main()
