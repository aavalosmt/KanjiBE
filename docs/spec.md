# Backend & Client Technical Specification: Interactive Reader Engine (Stories & Lyrics)

## 1. Executive Summary & Overview

This document outlines the end-to-end technical specification for a Node.js REST API and an iOS client (SwiftUI) reader module designed for Japanese language learning. Content (Stories and Song Lyrics) utilizes a Block-Based Content Architecture containing custom tokenized Markdown text with furigana annotations, inline image media, and bilingual translations.

## 2. Text Syntax & Furigana Alignment (Client Rules)

### 2.1 Syntax Standard

Text entries are provided using a modified Markdown link syntax containing internal dot (`.`) delimiters within the reading parameter:

```
[SurfaceText](furigana:ReadingSegments)
```

### 2.2 Token Alignment Logic (Run-Based Algorithm)

To prevent misalignment in complex Japanese grammar constructs (okurigana, intercalated kana, and jukujikun), tokens are parsed using contiguous character groupings (runs):

- **Surface Run Split:** Divide SurfaceText into contiguous character groups:
  - **Kanji-Run:** Consecutive characters within the Kanji Unicode range (U+4E00–U+9FAF).
  - **Kana-Run:** Consecutive Hiragana, Katakana, or punctuation characters.
- **Reading Split & Assignment:**
  - Split ReadingSegments by the period (`.`) delimiter.
  - Assign sub-readings sequentially only to Kanji-Runs.
  - Kana-Runs receive no ruby annotation.
- **Fallback Strategy:** If no period (`.`) delimiter is provided, or if the number of split readings does not match the Kanji-Run count, render the entire reading string centered over the complete SurfaceText block.

Examples:

- Compound Kanji: `[家族](furigana:か.ぞく)` → 家 (か) + 族 (ぞく)
- Okurigana: `[食べる](furigana:た.べる)` → 食 (た) + べる (plain text)
- Jukujikun / Fallback: `[今日](furigana:きょう)` → きょう rendered over 今日

The API stores this syntax as-is. Alignment is a client concern.

## 3. Data Schema

### 3.1 Block Sub-Schema

```json
{
  "id": "String (UUID)",
  "type": "text | image | header",
  "content": "String (Tokenized Markdown text if type == text or header)",
  "translation": "String (Optional - Spanish/English translation of the block)",
  "url": "String (Only if type == image)",
  "caption": "String (Optional)"
}
```

### 3.2 Story Entity

See `GET /api/stories/:id` and the seed data in `prisma/seed.ts`.

### 3.3 Lyric Entity

See `GET /api/lyrics/:id` and the seed data in `prisma/seed.ts`.

## 4. REST API Specification

Implemented in this repository:

- Public: `GET /api/stories`, `GET /api/stories/:id`, `GET /api/lyrics`, `GET /api/lyrics/:id`
- Admin: `POST|PUT|DELETE /api/admin/stories`, `POST|PUT|DELETE /api/admin/lyrics`, `POST /api/admin/upload`
