export type BlockType = "text" | "image" | "header";

export type ContentBlock = {
  id: string;
  type: BlockType;
  content?: string;
  translation?: string;
  url?: string;
  caption?: string;
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
  translation: string | null;
  coverUrl: string | null;
};

export type Lyric = LyricSummary & {
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
