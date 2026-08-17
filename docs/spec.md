# Backend & Client Technical Specification: Interactive Reader Engine (Stories, Lyrics & Conversations)

## 1. Executive Summary & Overview

This document outlines the end-to-end technical specification for a Node.js REST API and an iOS client (SwiftUI) reader module designed for Japanese language learning. Content (Stories, Song Lyrics, and Conversations) utilizes a Block-Based Content Architecture containing custom tokenized Markdown text with furigana annotations, inline image media, dialogue turns, and bilingual translations.

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
  "type": "text | image | header | dialogue",
  "content": "String (Tokenized Markdown text if type == text, header, or dialogue)",
  "translation": "String (Optional - Spanish/English translation of the block)",
  "url": "String (Only if type == image)",
  "caption": "String (Optional)",
  "speaker": "String (Required if type == dialogue, e.g. \"Clerk\", \"You\")",
  "notes": "String (Optional - grammar/cultural note for the block)"
}
```

### 3.2 Story Entity

See `GET /api/stories/:id` and the seed data in `prisma/seed.ts`.

### 3.3 Lyric Entity

See `GET /api/lyrics/:id` and the seed data in `prisma/seed.ts`.

### 3.4 Conversation Entity

A scripted chat-style dialogue between two or more speakers (e.g. a convenience store transaction, an immigration interview), grouped by a `topic` for browsing/filtering. Turns use `blocks` of `type: "dialogue"`, each carrying a `speaker` label alongside the usual furigana-tokenized `content` and `translation`. See `GET /api/conversations/:id`.

`topic` is not free text: it must be the `slug` of an existing Topic (see 3.5). Creating or updating a Conversation with an unregistered topic slug is rejected with `400`.

```json
{
  "id": "String (UUID)",
  "title": "String",
  "topic": "String (slug of a registered Topic, e.g. \"convenience_store\", \"immigration\")",
  "level": "String (Optional JLPT level)",
  "translation": "String (Optional)",
  "coverUrl": "String (Optional)",
  "blocks": "Block[]",
  "createdAt": "ISO 8601 DateTime",
  "updatedAt": "ISO 8601 DateTime"
}
```

### 3.5 Topic Entity

A small managed registry acting as an enum of valid conversation topics/scenarios, so clients can build filter UIs and so `Conversation.topic` values stay consistent instead of free text. See `GET /api/topics`.

```json
{
  "id": "String (UUID)",
  "slug": "String (snake_case, unique, e.g. \"convenience_store\")",
  "label": "String (display name, e.g. \"Convenience Store\")"
}
```

## 4. REST API Specification

Implemented in this repository:

- Public: `GET /api/stories`, `GET /api/stories/:id`, `GET /api/lyrics`, `GET /api/lyrics/:id`, `GET /api/conversations`, `GET /api/conversations/:id`, `GET /api/topics`, `GET /api/lookup?q=`
  - `GET /api/conversations` accepts `?topic=` and `?level=` query filters, plus `?page=`/`?limit=` pagination, matching the Story/Lyric list endpoints.
  - `GET /api/topics` returns all registered topics sorted by `label`, for building filter UIs.
- Admin: `POST|PUT|DELETE /api/admin/stories`, `POST|PUT|DELETE /api/admin/lyrics`, `POST|PUT|DELETE /api/admin/conversations`, `POST /api/admin/topics`, `POST /api/admin/upload`
