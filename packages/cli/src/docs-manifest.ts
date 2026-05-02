// @ts-nocheck
import matter from "gray-matter";

// Auto-generated manifest - DO NOT EDIT MANUALLY
// Run: bun run generate:manifest

import DOC__00 from "../../../skills/effect-solutions/topics/00-quick-start.md" with { type: "text" };
import DOC__01 from "../../../skills/effect-solutions/topics/01-project-setup.md" with { type: "text" };
import DOC__02 from "../../../skills/effect-solutions/topics/02-tsconfig.md" with { type: "text" };
import DOC__03 from "../../../skills/effect-solutions/topics/03-basics.md" with { type: "text" };
import DOC__04 from "../../../skills/effect-solutions/topics/04-services-and-layers.md" with { type: "text" };
import DOC__05 from "../../../skills/effect-solutions/topics/05-data-modeling.md" with { type: "text" };
import DOC__06 from "../../../skills/effect-solutions/topics/06-error-handling.md" with { type: "text" };
import DOC__07 from "../../../skills/effect-solutions/topics/07-config.md" with { type: "text" };
import DOC__08 from "../../../skills/effect-solutions/topics/08-testing.md" with { type: "text" };
import DOC__09 from "../../../skills/effect-solutions/topics/09-project-structure.md" with { type: "text" };
import DOC__10 from "../../../skills/effect-solutions/topics/10-incremental-adoption.md" with { type: "text" };
import DOC__11 from "../../../skills/effect-solutions/topics/11-http-clients.md" with { type: "text" };
import DOC__12 from "../../../skills/effect-solutions/topics/12-observability.md" with { type: "text" };
import DOC__13 from "../../../skills/effect-solutions/topics/13-cli.md" with { type: "text" };
import DOC__14 from "../../../skills/effect-solutions/topics/14-use-pattern.md" with { type: "text" };

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
  { filename: "00-quick-start.md", source: DOC__00 },
  { filename: "01-project-setup.md", source: DOC__01 },
  { filename: "02-tsconfig.md", source: DOC__02 },
  { filename: "03-basics.md", source: DOC__03 },
  { filename: "04-services-and-layers.md", source: DOC__04 },
  { filename: "05-data-modeling.md", source: DOC__05 },
  { filename: "06-error-handling.md", source: DOC__06 },
  { filename: "07-config.md", source: DOC__07 },
  { filename: "08-testing.md", source: DOC__08 },
  { filename: "09-project-structure.md", source: DOC__09 },
  { filename: "10-incremental-adoption.md", source: DOC__10 },
  { filename: "11-http-clients.md", source: DOC__11 },
  { filename: "12-observability.md", source: DOC__12 },
  { filename: "13-cli.md", source: DOC__13 },
  { filename: "14-use-pattern.md", source: DOC__14 },
];

const filenameToSlug = (filename: string): string => {
  // Strip .md extension and numeric prefix (e.g., "01-project-setup.md" -> "project-setup")
  return filename.replace(/\.md$/, "").replace(/^\d+-/, "");
};

const stripFirstH1 = (content: string): string => {
  // Strip first H1 to match website behavior
  return content.replace(/^#\s+.*\n?/, "").trimStart();
};

const rewriteInternalLinks = (content: string): string => {
  // Rewrite internal links: /01-project-setup -> project-setup
  return content.replace(
    /\[([^\]]+)\]\(\/(\d+-)?([^)]+)\)/g,
    (_match, text, _prefix, slug) => {
      return `[${text}](${slug})`;
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
      throw new Error(`Doc ${filename} missing title`);
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
