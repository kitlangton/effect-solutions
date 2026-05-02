#!/usr/bin/env bun

import { readdirSync } from "node:fs"
import { join } from "node:path"

const DOCS_DIR = join(import.meta.dir, "../../../skills/effect-solutions/topics")
const OUTPUT_FILE = join(import.meta.dir, "../src/docs-manifest.ts")

// Find all .md files in docs directory
const docFiles = readdirSync(DOCS_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort()

// Generate import statements
const imports = docFiles.map((filename, i) => {
  const varName = `DOC__${i.toString().padStart(2, "0")}`
  return `import ${varName} from "../../../skills/effect-solutions/topics/${filename}" with { type: "text" };`
})

// Generate RAW_DOCS array
const rawDocsEntries = docFiles.map((filename, i) => {
  const varName = `DOC__${i.toString().padStart(2, "0")}`
  return `  { filename: "${filename}", source: ${varName} },`
})

const manifest = `// @ts-nocheck
import matter from "gray-matter";

// Auto-generated manifest - DO NOT EDIT MANUALLY
// Run: bun run generate:manifest

${imports.join("\n")}

type DocMeta = {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly order: number;
  readonly body: string;
};

type RawDoc = {
  readonly filename: string;
  readonly source: string;
};

const RAW_DOCS: ReadonlyArray<RawDoc> = [
${rawDocsEntries.join("\n")}
];

const filenameToSlug = (filename: string): string => {
  // Strip .md extension and numeric prefix (e.g., "01-project-setup.md" -> "project-setup")
  return filename.replace(/\\.md$/, "").replace(/^\\d+-/, "");
};

const stripFirstH1 = (content: string): string => {
  // Strip first H1 to match website behavior
  return content.replace(/^#\\s+.*\\n?/, "").trimStart();
};

const rewriteInternalLinks = (content: string): string => {
  // Rewrite internal links: /01-project-setup -> project-setup
  return content.replace(
    /\\[([^\\]]+)\\]\\(\\/(\\d+-)?([^)]+)\\)/g,
    (_match, text, _prefix, slug) => {
      return \`[\${text}](\${slug})\`;
    },
  );
};

const parseDocs = (): ReadonlyArray<DocMeta> => {
  const docs = RAW_DOCS.map(({ filename, source }) => {
    const { data, content } = matter(source);
    const slug = filenameToSlug(filename);

    // Skip drafts
    if (data.draft === true) {
      return null;
    }

    const title = data.title as string;
    const description = (data.description as string) || "";
    const order = (data.order as number) ?? 999;

    if (!title) {
      throw new Error(\`Doc \${filename} missing title\`);
    }

    return {
      slug,
      title,
      description,
      order,
      body: rewriteInternalLinks(stripFirstH1(content)).trimEnd(),
    } as const;
  }).filter((doc): doc is DocMeta => doc !== null);

  // Sort by order field
  return docs.sort((a, b) => a.order - b.order);
};

export const DOCS = parseDocs();

export const DOC_LOOKUP: Record<string, DocMeta> = DOCS.reduce(
  (acc, doc) => {
    acc[doc.slug] = doc;
    return acc;
  },
  {} as Record<string, DocMeta>,
);
`

await Bun.write(OUTPUT_FILE, manifest)
console.log(`✓ Generated manifest with ${docFiles.length} docs`)
console.log(`  → ${OUTPUT_FILE}`)
