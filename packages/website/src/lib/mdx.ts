import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import { normalizeDocSlug } from "./normalizeDocSlug"

const docsDirectory = path.join(process.cwd(), "../../skills/effect-solutions/topics")

export type DocGroup = "Setup" | "Core Patterns" | "Ecosystem"

const VALID_GROUPS: Set<string> = new Set(["Setup", "Core Patterns", "Ecosystem"])

function parseGroup(group: unknown): DocGroup {
  if (typeof group === "string" && VALID_GROUPS.has(group)) {
    return group as DocGroup
  }
  return "Core Patterns"
}

export interface DocMetadata {
  title: string
  description?: string
  order?: number
  draft?: boolean
  group: DocGroup
}

export interface Doc extends DocMetadata {
  slug: string
  content: string
}

export { normalizeDocSlug }

interface DocFileEntry {
  fileName: string
  baseName: string
  slug: string
  fullPath: string
}

function getDocFileEntries(): DocFileEntry[] {
  if (!fs.existsSync(docsDirectory)) {
    return []
  }

  return fs
    .readdirSync(docsDirectory)
    .filter((name) => name.endsWith(".md") || name.endsWith(".mdx"))
    .map((fileName) => {
      const baseName = fileName.replace(/\.(mdx?|md)$/, "")
      return {
        fileName,
        baseName,
        slug: normalizeDocSlug(baseName),
        fullPath: path.join(docsDirectory, fileName),
      } satisfies DocFileEntry
    })
}

function stripFirstH1(content: string): string {
  return content.replace(/^#\s+.+$/m, "").trim()
}

function normalizeDocLinkTarget(target: string): string {
  const sanitized = target
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\.(mdx?|md)$/, "")
  return normalizeDocSlug(sanitized)
}

function processInternalLinks(content: string): string {
  const relativeDocLink = /\[([^\]]+)\]\((?!https?:\/\/|\/|#)([^)#?]+?)(#[^)]+)?\)/g
  const prefixedAbsoluteLink = /\[([^\]]+)\]\(\/((?:\d+-)[^)#?]+?)(?:\.(?:mdx?|md))?(#[^)]+)?\)/g

  return content
    .replace(relativeDocLink, (_match, text, target: string, hash: string | undefined) => {
      const slug = normalizeDocLinkTarget(target)
      return `[${text}](/${slug}${hash ?? ""})`
    })
    .replace(prefixedAbsoluteLink, (_match, text, target: string, hash: string | undefined) => {
      const slug = normalizeDocLinkTarget(target)
      return `[${text}](/${slug}${hash ?? ""})`
    })
}

function parseDocEntry(entry: DocFileEntry): Doc | null {
  try {
    const fileContents = fs.readFileSync(entry.fullPath, "utf8")
    const { data, content } = matter(fileContents)
    const processedContent = processInternalLinks(stripFirstH1(content))

    return {
      slug: entry.slug,
      title: data.title || entry.slug,
      description: data.description,
      order: data.order,
      draft: data.draft,
      group: parseGroup(data.group),
      content: processedContent,
    } satisfies Doc
  } catch {
    return null
  }
}

function findDocEntry(slug: string): DocFileEntry | undefined {
  const normalized = normalizeDocSlug(slug)
  const entries = getDocFileEntries()
  return entries.find((entry) => entry.slug === normalized) ?? entries.find((entry) => entry.baseName === slug)
}

export function getAllDocSlugs(): string[] {
  return getDocFileEntries().map((entry) => entry.slug)
}

export function getDocBySlug(slug: string): Doc | null {
  const entry = findDocEntry(slug)
  if (!entry) {
    return null
  }
  return parseDocEntry(entry)
}

export function getAllDocs(): Doc[] {
  const docs = getDocFileEntries()
    .map((entry) => parseDocEntry(entry))
    .filter((doc): doc is Doc => doc !== null)
    .filter((doc) => {
      if (process.env.NODE_ENV === "production") {
        return !doc.draft
      }
      return true
    })

  return docs.sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order
    }
    return a.title.localeCompare(b.title)
  })
}

export function getDocTitles(): Record<string, string> {
  const docs = getAllDocs()
  return docs.reduce(
    (acc, doc) => {
      acc[doc.slug] = doc.title
      return acc
    },
    {} as Record<string, string>,
  )
}

export function getOrderedDocSlugs(): string[] {
  return getAllDocs().map((doc) => doc.slug)
}

export function getNextDocSlug(currentSlug: string): string | null {
  const slugs = getOrderedDocSlugs()
  const currentIndex = slugs.indexOf(currentSlug)

  if (currentIndex === -1 || currentIndex === slugs.length - 1) {
    return null
  }

  return slugs[currentIndex + 1] ?? null
}
