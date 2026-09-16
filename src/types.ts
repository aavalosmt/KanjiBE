export type BlockType = "text" | "image" | "header" | "dialogue";

export type BlockToken = {
  surface: string;
  lemma: string;
  reading?: string | null;
  pos?: string;
  posEn?: string | null;
  colorType: string;
  color: string;
  inflectionEn?: string | null;
  grammarEn?: string | null;
};

export type ContentBlock = {
  id: string;
  type: BlockType;
  content?: string;
  translation?: string;
  translationLang?: string;
  url?: string;
  caption?: string;
  speaker?: string;
  notes?: string;
  tokens?: BlockToken[];
  startTime?: number | null;
};

export type StorySummary = {
  id: string;
  title: string;
  level: string;
  translation: string | null;
  translationLang: string;
  coverUrl: string | null;
};

export type Story = StorySummary & {
  blocks: ContentBlock[];
  createdAt: string;
  updatedAt: string;
};

export type LyricSummary = {
  id: string;
  title: string;
  artist: string;
  level: string | null;
  translation: string | null;
  translationLang: string;
  coverUrl: string | null;
  youtubeUrl: string | null;
};

export type Lyric = LyricSummary & {
  blocks: ContentBlock[];
  createdAt: string;
  updatedAt: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  topic: string;
  level: string | null;
  translation: string | null;
  translationLang: string;
  coverUrl: string | null;
};

export type Conversation = ConversationSummary & {
  blocks: ContentBlock[];
  createdAt: string;
  updatedAt: string;
};

export type Topic = {
  id: string;
  slug: string;
  label: string;
};

export type Subtopic = {
  id: string;
  topicSlug: string;
  slug: string;
  label: string;
};

export type Paginated<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
};

export type MangaBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MangaMorphologyItem = {
  surface: string;
  pos: string;
};

export type MangaDialogue = {
  dialogue_index: number;
  dialogue_box: MangaBox;
  full_text: string;
  tokens: string[];
  furigana: string;
  morphology: MangaMorphologyItem[];
};

export type MangaPage = {
  page_index: number;
  image_url: string;
  image_checksum: string;
  width: number;
  height: number;
  dialogues: MangaDialogue[];
};

export type MangaVolumeSummary = {
  id: string;
  title: string;
  volume_number: string | null;
  total_pages: number | null;
  cover_url: string | null;
  page_count: number;
  created_at: string;
  updated_at: string;
};

export type MangaVolume = MangaVolumeSummary & {
  pages: MangaPage[];
};

export type VocabularyBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VocabularyMorphologyItem = {
  surface: string;
  pos: string;
};

export type VocabularyEntry = {
  entry_index: number;
  entry_box: VocabularyBox;
  full_text: string;
  tokens: string[];
  furigana: string;
  morphology: VocabularyMorphologyItem[];
};

export type VocabularyPage = {
  page_index: number;
  image_url: string;
  image_checksum: string;
  width: number;
  height: number;
  entries: VocabularyEntry[];
};

export type VocabularyContentType = "image" | "list";

export type VocabularyWordEntry = {
  word_index: number;
  term: string;
  furigana: string;
  translation: string;
  translationLang: string;
};

export type VocabularySetSummary = {
  id: string;
  topic: string;
  subtopic: string;
  content_type: VocabularyContentType;
  title: string;
  cover_url: string | null;
  item_count: number;
  created_at: string;
  updated_at: string;
};

export type ExampleSentence = {
  sentence_index: number;
  text: string;
  furigana: string;
  translation: string;
  translationLang: string;
  notes?: string;
};

// Server-driven UI layout tree — see src/lib/sdui.ts for the heuristic that
// computes it and the Zod schema that validates an admin override.
export type SduiDataKey = "words" | "pages" | "example_sentences";

export type SduiNode =
  | {
      id: string;
      type: "stack";
      title?: string;
      direction?: "vertical" | "horizontal";
      children: SduiNode[];
    }
  | {
      id: string;
      type: "collapsible";
      title: string;
      collapsed: boolean;
      children: SduiNode[];
    }
  | { id: string; type: "grid"; columns: number; data: SduiDataKey }
  | {
      id: string;
      type: "table";
      data: SduiDataKey;
      tableColumns?: { key: string; label: string }[];
    }
  | { id: string; type: "carousel"; data: SduiDataKey };

export type VocabularySet = VocabularySetSummary & {
  pages: VocabularyPage[];
  words: VocabularyWordEntry[];
  example_sentences: ExampleSentence[];
  layout: SduiNode;
};
