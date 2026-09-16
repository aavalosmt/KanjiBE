# KanjiBE

API REST de Node.js para el lector interactivo de historias y letras (japonés). El texto tokenizado con furigana se guarda tal cual; el alineado ruby es responsabilidad del cliente iOS.

- Spec: [`docs/spec.md`](docs/spec.md)
- Estado de la implementación y plan de deploy: [`docs/implementacion-y-deploy.md`](docs/implementacion-y-deploy.md)

## Requisitos

- Node.js 20.19+ (`nvm use` lee `.nvmrc`)
- SQLite (incluido, no hay que instalar nada más)

## Arranque local

```bash
nvm use
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

El servidor queda en `http://localhost:3000`.

Panel CRUD: [http://localhost:3000/admin/](http://localhost:3000/admin/)  
Importar JSON (cuentos/canciones/conversaciones): [http://localhost:3000/admin/#/import](http://localhost:3000/admin/#/import) — formato en [`docs/import-json.md`](docs/import-json.md).  
Tokenizar / traducir con IA: misma página. Elige proveedor en el panel — Gemini (`GEMINI_API_KEY`) o Grok/xAI (`XAI_API_KEY`). `AI_PROVIDER` fija el predeterminado (`gemini` por defecto); `XAI_MODEL` el modelo Grok por defecto.  
Admin key de desarrollo: `dev-admin-key` (cámbiala en `.env` antes de subir a hosting).

## Endpoints públicos (iOS)

- `GET /api/stories?page=1&limit=20&level=N3`
- `GET /api/stories/:id`
- `GET /api/lyrics?page=1&limit=20`
- `GET /api/lyrics/:id` — incluye `youtubeUrl` y `startTime` por verso si vino de LRCLib
- `GET /api/conversations?page=1&limit=20&topic=convenience_store&level=N4`
- `GET /api/conversations/:id` — bloques `type: "dialogue"` con `speaker` por turno
- `GET /api/topics` — lista de temas registrados (`{ id, slug, label }`), para poblar filtros. El `topic` de una conversación debe ser un `slug` ya registrado aquí.
- `GET /api/subtopics?topic=body` — lista de subtemas registrados (`{ id, topicSlug, slug, label }`), opcionalmente filtrados por topic. El `topic`/`subtopic` de un set de vocabulario deben ser slugs ya registrados aquí.
- `GET /api/manga?page=1&limit=20` — tomos (sin `pages`)
- `GET /api/manga/:id` — tomo completo con `pages[].dialogues[]` (OCR + morfología ya resuelta por el cliente desktop, ver [`docs/manga-ingest.md`](docs/manga-ingest.md))
- `GET /api/vocabulary?page=1&limit=20&topic=body` — sets de vocabulario (sin `pages`/`words`)
- `GET /api/vocabulary/:topic/:subtopic` — set completo: `pages[].entries[]` si es imagen, `words[]` si es lista, más `example_sentences[]` y `layout` (SDUI: columnas/tabla/colapsable/carrusel, ver [`docs/vocabulary-sdui.md`](docs/vocabulary-sdui.md)) (ver [`docs/vocabulary-ingest.md`](docs/vocabulary-ingest.md))
- `GET /api/examples/:topic/:subtopic?lang=` — oraciones de ejemplo de un subtopic (idioma base **inglés**); `404` si el subtopic no está registrado
- Admin: `GET /api/admin/lrclib/search?q=` y `POST /api/admin/lrclib/import` `{ id }` — busca, sincroniza, tokeniza y guarda
- `GET /health`
- `GET /api/lookup?q=知らない` — lematiza (知る) y describe el verbo en inglés (`godan verb 知る in the negative form`). También `GET /api/lookup/知らない`.
- `POST /api/analyze` `{ "text" | "content" }` — análisis morfológico de un bloque (POS + color). Agrupa verbo + auxiliares (`食べました`). Acepta markup `[家族](furigana:か.ぞく)`.

Las listas no incluyen `blocks`. El detalle sí, con traducciones y en el orden guardado.

## Endpoints admin

Protegidos con `X-Admin-Key: <ADMIN_API_KEY>` o `Authorization: Bearer <ADMIN_API_KEY>`.

- `POST /api/admin/stories`
- `PUT /api/admin/stories/:id`
- `DELETE /api/admin/stories/:id`
- `POST /api/admin/lyrics`
- `PUT /api/admin/lyrics/:id`
- `DELETE /api/admin/lyrics/:id`
- `POST /api/admin/conversations`
- `PUT /api/admin/conversations/:id`
- `DELETE /api/admin/conversations/:id`
- `POST /api/admin/topics` `{ slug, label }` — `slug` en snake_case; 409 si ya existe
- `POST /api/admin/subtopics` `{ topicSlug, slug, label }` — `slug` en snake_case bajo un topic existente; 400 si el topic no existe, 409 si el subtopic ya existe
- `POST /api/admin/upload` — `multipart/form-data` con campo `file` o `image`
- Manga (contrato completo en [`docs/manga-ingest.md`](docs/manga-ingest.md)):
  - `POST /api/admin/manga/upload-image` — `multipart/form-data`, campos `image` + `image_checksum` (sha256), dedup por checksum
  - `POST /api/admin/manga/ingest` — upsert de un tomo + sus páginas/diálogos, idempotente por `volume_id`
  - `GET /api/admin/manga`, `PATCH /api/admin/manga/:id` (title/volume_number/cover_url), `GET /api/admin/manga/:id/pages/:pageIndex`
  - `PATCH /api/admin/manga/:id/pages/:pageIndex/dialogues/:dialogueIndex`
  - `PUT /api/admin/manga/:id/pages/:pageIndex/image`, `DELETE /api/admin/manga/:id/pages/:pageIndex`
- Vocabulario (dirigido por `topic`/`subtopic` en vez de un id, completo en [`docs/vocabulary-ingest.md`](docs/vocabulary-ingest.md)):
  - `POST /api/admin/vocabulary/upload-image` — `multipart/form-data`, campos `image` + `image_checksum` (sha256), dedup por checksum (solo sets `content_type: "image"`)
  - `POST /api/admin/vocabulary/ingest` — upsert de un set + sus páginas/entradas o palabras, idempotente por `(topic, subtopic)`; `content_type: "image" | "list"` decide la forma
  - `GET /api/admin/vocabulary`, `PATCH /api/admin/vocabulary/:topic/:subtopic` (title/cover_url/layout — SDUI, ver [`docs/vocabulary-sdui.md`](docs/vocabulary-sdui.md)), `GET /api/admin/vocabulary/:topic/:subtopic/pages/:pageIndex`
  - `PATCH /api/admin/vocabulary/:topic/:subtopic/pages/:pageIndex/entries/:entryIndex`, `PUT .../pages/:pageIndex/image`, `DELETE .../pages/:pageIndex` (formato imagen)
  - `PATCH /api/admin/vocabulary/:topic/:subtopic/words/:wordIndex`, `DELETE .../words/:wordIndex` (formato lista)
- Oraciones de ejemplo (atadas a un topic/subtopic registrado, base inglés, ver [`docs/vocabulary-ingest.md`](docs/vocabulary-ingest.md)):
  - `PUT /api/admin/examples/:topic/:subtopic` — reemplazo total `{ sentences: [{ id?, text, furigana, translation, notes? }] }`
  - `PUT /api/admin/examples/:topic/:subtopic/:index/translations/:lang` — overlay por idioma (400 si `lang=en`)
  - `POST /api/admin/examples/:topic/:subtopic/generate` `{ text, provider?, model? }` — furigana + traducción al inglés vía Gemini/Grok, sin persistir

## Hosting (Railway)

El build de Prisma ya no exige `DATABASE_URL` en tiempo de imagen. Aun así, en **Variables** del servicio pon:

| Variable | Valor |
| --- | --- |
| `ADMIN_API_KEY` | un secreto tuyo |
| `PUBLIC_BASE_URL` | la URL que te da Railway, sin slash final |
| `DATABASE_URL` | `file:./data/kanji.db` |
| `UPLOAD_DIR` | `/app/data/uploads` |

Railway asigna `PORT` solo. En Settings genera un dominio público (el servicio sale como *Unexposed* hasta que lo hagas). Monta un Volume en `/app/data` si no quieres perder la DB en cada deploy.

Detalle: [`docs/implementacion-y-deploy.md`](docs/implementacion-y-deploy.md).

## Tests

```bash
npx prisma generate
npm test
```
