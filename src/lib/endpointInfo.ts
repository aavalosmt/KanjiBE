import type { Request, RequestHandler, Response } from "express";

export const PUBLIC_AUTH = "None";
export const ADMIN_AUTH =
  "Admin required: header X-Admin-Key: <ADMIN_API_KEY> or Authorization: Bearer <ADMIN_API_KEY>";

export interface EndpointInfo {
  method: "GET";
  path: string;
  description: string;
  auth: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
  // A concrete, ready-to-run request line, e.g. "GET /api/stories?page=1&limit=20&level=N3".
  example_request: string;
  response_example: unknown;
  // Only set when the response includes tokenizer/morphology output (tokens,
  // pos, colorType, lemma, conjugation, or client-supplied morphology on
  // manga/vocabulary "image" entries) — explains where that data comes from
  // and the rules used to produce it.
  tokenization?: string;
}

// Shared prose blocks so the same pipeline is described identically everywhere
// it shows up, instead of drifting across ~11 endpoints.
export const TOKENIZATION_ANALYZE =
  'Tokeniza con kuromoji (diccionario IPADIC). Antes de tokenizar se quita el markup de furigana "[texto](furigana:lectura)" (stripFuriganaMarkup). Cada token recibe un pos en japonés mapeado a colorType/color de UI: 名詞→noun #3B82F6, 動詞→verb #10B981, 形容詞/形容動詞→adjective #F59E0B, 助詞→particle #6B7280, 助動詞→aux-verb #34D399, 副詞→adverb #8B5CF6, el resto→other #9CA3AF. Un 助動詞 que sigue a un 動詞/形容詞/形容動詞 se fusiona en el token anterior (parts[] con el desglose), para que conjugaciones como 食べました salgan como un solo token coloreado (groupVerbAuxiliaries).';

export const TOKENIZATION_LOOKUP =
  "Tokeniza con kuromoji (IPADIC) toda la expresión. Se descartan como 'tokens de contenido' (para lemmas/lookupKeys) los de pos 記号/フィラー y los 助詞/助動詞 salvo que sean 非自立 (no independientes). El lema de cada token es basic_form si existe, si no surface_form. grammarEn/formEn/inflectionEn/verbClassEn describen la conjugación en inglés con reglas heurísticas sobre pos/conjugated_type/conjugated_form (src/lib/grammar.ts).";

export const TOKENIZATION_CLIENT_SUPPLIED =
  "tokens y morphology no se generan en este backend: el cliente de ingesta (OCR desktop) ya los resuelve y los manda en el ingest; el backend solo los persiste y los sirve tal cual, sin re-tokenizar.";

export const TOKENIZATION_CLIENT_SUPPLIED_IMAGE_ONLY = `Solo aplica a páginas de un set content_type: "image" (pages[].entries[].tokens/morphology). Los sets content_type: "list" no llevan tokens. ${TOKENIZATION_CLIENT_SUPPLIED}`;

// Mounted as a sibling "/info" route next to the GET endpoint it documents
// (e.g. GET /api/stories/:id/info describes GET /api/stories/:id). Always
// public and side-effect free, even when the endpoint it documents requires
// admin auth — it only describes usage, it never returns real data.
export function infoHandler(info: EndpointInfo): RequestHandler {
  return (_req: Request, res: Response) => {
    res.json(info);
  };
}
