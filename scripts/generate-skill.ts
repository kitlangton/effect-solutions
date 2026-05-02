#!/usr/bin/env bun
/// <reference types="bun-types" />
import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import matter from "gray-matter"
import type { DocGroup, DocMetadata } from "../packages/website/src/lib/mdx"

const BASE_DIR = import.meta.dirname

const TOPICS_DIR = join(BASE_DIR, "../skills/effect-solutions/topics")
const OUTPUT_FILE = join(BASE_DIR, "../skills/effect-solutions/SKILL.md")
const CLI_PACKAGE_JSON = join(BASE_DIR, "../packages/cli/package.json")

export const VALID_GROUPS = ["Setup", "Core Patterns", "Ecosystem"] as const satisfies readonly DocGroup[]

export interface Topic extends DocMetadata {
  fileName: string
  slug: string
  description: string
  order: number
}

/**
 * Skill frontmatter per the Agent Skills specification.
 * @see https://agentskills.io/specification#skill-md-format
 * @see https://cli.github.com/manual/gh_skill_publish (validation rules enforced at publish time)
 */
interface SkillFrontmatter {
  /** Required. Max 64 chars. Lowercase letters, numbers, and hyphens only. Must not start or end with a hyphen. */
  name: string
  /** Required. Max 1024 chars. Non-empty. Describes what the skill does and when to use it. */
  description: string
  /** Optional. License name or reference to a bundled license file. */
  license?: string
  /** Optional. Max 500 chars. Indicates environment requirements (intended product, system packages, network access, etc.). Currently unused. */
  compatibility?: string
  /** Optional. Arbitrary key-value mapping for additional metadata. */
  metadata?: {
    author: string
    version: string
  }
  /**
   * Optional (Experimental). Space-separated string of pre-approved tools the skill may use.
   * Currently unused. NOTE: must be a string, not an array — `gh skill publish` validation rejects arrays.
   * @see https://cli.github.com/manual/gh_skill_publish
   */
  "allowed-tools"?: string
}

// Constraints from https://agentskills.io/specification#skill-md-format
export const MAX_DESCRIPTION = 1024
export const MAX_NAME = 64
export const NAME_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

/**
 * Strip leading numeric prefix and `.md` extension to get the slug.
 */
const filenameToSlug = (filename: string): string => filename.replace(/\.md$/, "").replace(/^\d+-/, "")

export const parseGroup = (g: unknown): DocGroup =>
  typeof g === "string" && (VALID_GROUPS as readonly string[]).includes(g) ? (g as DocGroup) : "Core Patterns"

/**
 * Read every non-draft topic file and parse frontmatter into Topic records.
 */
export async function loadTopics(): Promise<Topic[]> {
  const entries = (await readdir(TOPICS_DIR)).filter((f) => f.endsWith(".md")).sort()

  const topics: Topic[] = []
  for (const fileName of entries) {
    const raw = await readFile(join(TOPICS_DIR, fileName), "utf8")
    const { data } = matter(raw)
    if (data.draft === true) continue
    const title = typeof data.title === "string" ? data.title : ""
    if (!title) throw new Error(`Topic ${fileName} missing title`)
    topics.push({
      fileName,
      slug: filenameToSlug(fileName),
      title,
      description: typeof data.description === "string" ? data.description : "",
      order: typeof data.order === "number" ? data.order : 999,
      group: parseGroup(data.group),
    })
  }
  return topics.sort((a, b) => a.order - b.order)
}

const INTRO =
  "Effect TypeScript best practices: services, layers, error handling, schema-based data modeling, configuration, and testing."
const TRIGGER = "Use when writing, reviewing, or refactoring Effect code in TypeScript projects."

export function buildDescription(topics: Pick<Topic, "slug">[]): string {
  const prefix = `${INTRO} ${TRIGGER} Topics: `
  const full = `${prefix}${topics.map((t) => t.slug).join(", ")}.`
  if (full.length <= MAX_DESCRIPTION) return full

  const suffix = ", ..."
  const kept: string[] = []
  for (const { slug } of topics) {
    const candidate = `${prefix}${[...kept, slug].join(", ")}${suffix}`
    if (candidate.length > MAX_DESCRIPTION) break
    kept.push(slug)
  }
  return `${prefix}${kept.join(", ")}${suffix}`
}

export function renderFrontmatter(fm: SkillFrontmatter): string {
  const lines = ["---", `name: ${fm.name}`, `description: ${JSON.stringify(fm.description)}`]
  if (fm.license !== undefined) lines.push(`license: ${fm.license}`)
  if (fm.compatibility !== undefined) lines.push(`compatibility: ${JSON.stringify(fm.compatibility)}`)
  if (fm.metadata !== undefined) {
    lines.push("metadata:")
    lines.push(`  author: ${fm.metadata.author}`)
    lines.push(`  version: "${fm.metadata.version}"`)
  }
  if (fm["allowed-tools"] !== undefined) lines.push(`allowed-tools: ${JSON.stringify(fm["allowed-tools"])}`)
  lines.push("---", "")
  return lines.join("\n")
}

export function renderBody(topics: Topic[]): string {
  const sections = VALID_GROUPS.map((group) => {
    const inGroup = topics.filter((t) => t.group === group)
    if (inGroup.length === 0) return null
    const lines = inGroup.map((t) => `- **${t.slug}:** ${t.description} (\`topics/${t.fileName}\`)`)
    return `### ${group}\n\n${lines.join("\n")}`
  })
    .filter((s): s is string => s !== null)
    .join("\n\n")

  return [
    "# Effect Solutions",
    "",
    "Curated Effect TypeScript patterns for common scenarios: error handling, services, layers, testing, and more. For humans and AI agents.",
    "",
    "Browse the full site at https://www.effect.solutions or use the `effect-solutions` CLI for offline access.",
    "",
    "## Topics",
    "",
    sections,
    "",
    "## How to Use",
    "",
    "When working on Effect TypeScript code, identify the relevant topics from the index above and read the corresponding file from `topics/<NN-slug>.md` (paths are listed in parentheses next to each topic). Each topic file is self-contained; read only what is relevant to the current task instead of loading every topic at once.",
    "",
    "Always consult these topics before guessing at Effect APIs or patterns.",
    "",
  ].join("\n")
}

export async function generateSkill() {
  const topics = await loadTopics()
  if (topics.length === 0) throw new Error("No non-draft topics found")

  const pkg = JSON.parse(await readFile(CLI_PACKAGE_JSON, "utf8")) as {
    version: string
  }

  const description = buildDescription(topics)
  const frontmatter = renderFrontmatter({
    name: "effect-solutions",
    description,
    license: "MIT",
    metadata: { author: "Kit Langton", version: pkg.version },
  })
  const body = renderBody(topics)

  await writeFile(OUTPUT_FILE, frontmatter + body)
  return { topics, description, outputFile: OUTPUT_FILE }
}

if (import.meta.main) {
  const { topics, description } = await generateSkill()
  console.log(
    `✓ Generated SKILL.md with ${topics.length} topics (description: ${description.length}/${MAX_DESCRIPTION} chars)`,
  )
  console.log(`  → ${OUTPUT_FILE}`)
}
