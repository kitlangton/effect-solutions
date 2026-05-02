import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import matter from "gray-matter"
import { describe, expect, it } from "vitest"
import {
  buildDescription,
  generateSkill,
  MAX_DESCRIPTION,
  MAX_NAME,
  NAME_RE,
  parseGroup,
  type Topic,
  VALID_GROUPS,
} from "../scripts/generate-skill"

const ROOT = join(import.meta.dirname, "..")
const TOPICS_DIR = join(ROOT, "skills/effect-solutions/topics")
const SKILL_FILE = join(ROOT, "skills/effect-solutions/SKILL.md")
const CLI_PACKAGE_JSON = join(ROOT, "packages/cli/package.json")

const GROUP_INDEX: Record<string, number> = Object.fromEntries(VALID_GROUPS.map((g, i) => [g, i]))

interface DiskTopic extends Topic {
  draft: boolean
}

const readTopicsFromDisk = async (): Promise<DiskTopic[]> => {
  const files = (await readdir(TOPICS_DIR)).filter((f) => f.endsWith(".md")).sort()
  return Promise.all(
    files.map(async (fileName) => {
      const raw = await readFile(join(TOPICS_DIR, fileName), "utf8")
      const { data } = matter(raw)
      return {
        fileName,
        slug: fileName.replace(/\.md$/, "").replace(/^\d+-/, ""),
        title: typeof data.title === "string" ? data.title : "",
        description: typeof data.description === "string" ? data.description : "",
        order: typeof data.order === "number" ? data.order : 999,
        group: parseGroup(data.group),
        draft: data.draft === true,
      }
    }),
  )
}

const readSkill = async () => {
  const raw = await readFile(SKILL_FILE, "utf8")
  return { raw, parsed: matter(raw) }
}

describe("skill generation", () => {
  it("generator runs end-to-end and produces parseable output", async () => {
    await generateSkill()
    const { parsed } = await readSkill()
    expect(parsed.content.length).toBeGreaterThan(0)
    expect(parsed.data).toBeTypeOf("object")
    const roundTrip = matter(matter.stringify(parsed.content, parsed.data))
    expect(roundTrip.data).toEqual(parsed.data)
    expect(roundTrip.content).toBe(parsed.content)
  })

  it("frontmatter has valid name, description, and metadata.version", async () => {
    const { parsed } = await readSkill()
    const data = parsed.data as {
      name?: unknown
      description?: unknown
      metadata?: { version?: unknown }
    }
    expect(data.name).toBe("effect-solutions")
    expect(data.name).toMatch(NAME_RE)
    expect((data.name as string).length).toBeLessThanOrEqual(MAX_NAME)
    expect(typeof data.description).toBe("string")
    const description = data.description as string
    expect(description.length).toBeGreaterThanOrEqual(1)
    expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION)
    const pkg = JSON.parse(await readFile(CLI_PACKAGE_JSON, "utf8")) as { version: string }
    expect(data.metadata?.version).toBe(pkg.version)
  })

  it("body contains a pointer to every non-draft topic and every target file exists", async () => {
    const { parsed } = await readSkill()
    const topics = (await readTopicsFromDisk()).filter((t) => !t.draft)
    expect(topics.length).toBeGreaterThan(0)
    for (const t of topics) {
      expect(parsed.content, `missing pointer for ${t.slug}`).toContain(`topics/${t.fileName}`)
      const exists = await readFile(join(TOPICS_DIR, t.fileName), "utf8")
        .then(() => true)
        .catch(() => false)
      expect(exists, `${t.fileName} not on disk`).toBe(true)
    }
  })

  it("excludes drafts from the body", async () => {
    const { parsed } = await readSkill()
    const drafts = (await readTopicsFromDisk()).filter((t) => t.draft)
    for (const t of drafts) {
      expect(parsed.content, `draft ${t.slug} leaked into body`).not.toContain(`topics/${t.fileName}`)
    }
  })

  it("groups topics by frontmatter group and orders by `order` within group", async () => {
    const { parsed } = await readSkill()
    const topics = (await readTopicsFromDisk()).filter((t) => !t.draft)
    const positioned = topics
      .map((t) => ({ ...t, position: parsed.content.indexOf(`topics/${t.fileName}`) }))
      .sort((a, b) => a.position - b.position)

    for (let i = 1; i < positioned.length; i++) {
      const prev = positioned[i - 1]
      const curr = positioned[i]
      if (prev === undefined || curr === undefined) throw new Error("unreachable: bounded loop")
      const prevGroup = GROUP_INDEX[prev.group] ?? 99
      const currGroup = GROUP_INDEX[curr.group] ?? 99
      expect(currGroup).toBeGreaterThanOrEqual(prevGroup)
      if (prev.group === curr.group) {
        expect(curr.order).toBeGreaterThan(prev.order)
      }
    }
  })

  it("is idempotent — re-running the generator produces no diff", async () => {
    await generateSkill()
    const before = await readFile(SKILL_FILE, "utf8")
    await generateSkill()
    const after = await readFile(SKILL_FILE, "utf8")
    expect(after).toBe(before)
  })
})

describe("buildDescription", () => {
  it("truncates with ellipsis when description exceeds the max length", () => {
    const oversized = Array.from({ length: 200 }, (_, i) => ({ slug: `topic-with-a-fairly-long-slug-${i}` }))
    const out = buildDescription(oversized)
    expect(out.length).toBeLessThanOrEqual(MAX_DESCRIPTION)
    expect(out).toMatch(/, \.\.\.$/)
    expect(out).toContain("topic-with-a-fairly-long-slug-0")
  })

  it("does not truncate when all topics fit", () => {
    const small = [{ slug: "a" }, { slug: "b" }]
    const out = buildDescription(small)
    expect(out.length).toBeLessThanOrEqual(MAX_DESCRIPTION)
    expect(out).toContain("a, b")
    expect(out).toMatch(/\.$/)
    expect(out).not.toContain("...")
  })
})
