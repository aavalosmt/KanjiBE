import { z } from "zod";
import type {
  ExampleSentence,
  SduiNode,
  VocabularyContentType,
  VocabularyPage,
  VocabularyWordEntry
} from "../types.js";

// Server-driven UI layout for a vocabulary set. The tree only ever references
// data already present in the vocabulary response (words/pages/example_sentences)
// — it never carries content of its own — so it stays cheap to compute and
// safe to override without touching the underlying data.
//
// Node schema is intentionally generic (a handful of container + leaf types)
// so it can be reused by other content types later without changing shape.
// Clients that see an unrecognized `type` should flatten its `children` (if
// any) into the parent, or skip it entirely — never hard-fail.

export const DATA_KEYS = ["words", "pages", "example_sentences"] as const;
export type DataKey = (typeof DATA_KEYS)[number];

const dataKeySchema = z.enum(DATA_KEYS);
const nodeId = z.string().trim().min(1);

const tableColumnSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1)
});

// z.lazy + discriminatedUnion for the recursive node tree.
export const sduiNodeSchema: z.ZodType<SduiNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      id: nodeId,
      type: z.literal("stack"),
      title: z.string().trim().min(1).optional(),
      direction: z.enum(["vertical", "horizontal"]).default("vertical"),
      children: z.array(sduiNodeSchema).min(1)
    }),
    z.object({
      id: nodeId,
      type: z.literal("collapsible"),
      title: z.string().trim().min(1),
      collapsed: z.boolean().default(true),
      children: z.array(sduiNodeSchema).min(1)
    }),
    z.object({
      id: nodeId,
      type: z.literal("grid"),
      columns: z.number().int().min(1).max(6),
      data: dataKeySchema
    }),
    z.object({
      id: nodeId,
      type: z.literal("table"),
      data: dataKeySchema,
      tableColumns: z.array(tableColumnSchema).optional()
    }),
    z.object({
      id: nodeId,
      type: z.literal("carousel"),
      data: dataKeySchema
    })
  ])
);

const GRID_THRESHOLD = 12;
const GRID_COLUMNS = 2;

export function computeDefaultLayout(input: {
  contentType: VocabularyContentType;
  words: VocabularyWordEntry[];
  pages: VocabularyPage[];
  exampleSentences: ExampleSentence[];
}): SduiNode {
  const children: SduiNode[] = [];

  if (input.contentType === "list") {
    const variantLabel = input.words.find((word) => word.variant)?.variant?.label;
    if (variantLabel) {
      // Any word carrying a second form (e.g. causative/shieki vs. plain) means
      // this is a comparison list — always render it as a table with both
      // forms as explicit columns, regardless of word count.
      children.push({
        id: "content",
        type: "table",
        data: "words",
        tableColumns: [
          { key: "term", label: "Term" },
          { key: "variant.term", label: variantLabel },
          { key: "translation", label: "Translation" }
        ]
      });
    } else {
      children.push(
        input.words.length <= GRID_THRESHOLD
          ? { id: "content", type: "grid", columns: GRID_COLUMNS, data: "words" }
          : { id: "content", type: "table", data: "words" }
      );
    }
  } else {
    children.push({ id: "content", type: "carousel", data: "pages" });
  }

  if (input.exampleSentences.length > 0) {
    children.push({
      id: "examples",
      type: "collapsible",
      title: "Example sentences",
      collapsed: true,
      children: [{ id: "examples-list", type: "grid", columns: 1, data: "example_sentences" }]
    });
  }

  return { id: "root", type: "stack", direction: "vertical", children };
}

// Parses+validates a stored layout override. Never throws — a corrupt or
// stale override should degrade to "no override" rather than break the
// response, since the heuristic default is always a safe fallback.
export function parseStoredLayout(raw: string | null | undefined): SduiNode | null {
  if (!raw) return null;
  try {
    const parsed = sduiNodeSchema.parse(JSON.parse(raw));
    return parsed;
  } catch (error) {
    console.error("Discarding invalid stored vocabulary layout", error);
    return null;
  }
}

export function resolveLayout(
  set: { layout?: string | null },
  data: {
    contentType: VocabularyContentType;
    words: VocabularyWordEntry[];
    pages: VocabularyPage[];
    exampleSentences: ExampleSentence[];
  }
): SduiNode {
  return parseStoredLayout(set.layout) ?? computeDefaultLayout(data);
}
