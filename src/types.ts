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
  url?: string;
  caption?: string;
  speaker?: string;
  tokens?: BlockToken[];
  startTime?: number | null;
};

export type StorySummary = {
  id: string;
  title: string;
  level: string;
  translation: string | null;
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
  coverUrl: string | null;
};

export type Conversation = ConversationSummary & {
  blocks: ContentBlock[];
  createdAt: string;
  updatedAt: string;
};

export type Paginated<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
};
