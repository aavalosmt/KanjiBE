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
Tokenizar con Gemini: misma página, requiere `GEMINI_API_KEY`.  
Admin key de desarrollo: `dev-admin-key` (cámbiala en `.env` antes de subir a hosting).

## Endpoints públicos (iOS)

- `GET /api/stories?page=1&limit=20&level=N3`
- `GET /api/stories/:id`
- `GET /api/lyrics?page=1&limit=20`
- `GET /api/lyrics/:id` — incluye `youtubeUrl` y `startTime` por verso si vino de LRCLib
- `GET /api/conversations?page=1&limit=20&topic=convenience_store&level=N4`
- `GET /api/conversations/:id` — bloques `type: "dialogue"` con `speaker` por turno
- `GET /api/topics` — lista de temas registrados (`{ id, slug, label }`), para poblar filtros. El `topic` de una conversación debe ser un `slug` ya registrado aquí.
- `GET /api/manga?page=1&limit=20` — tomos (sin `pages`)
- `GET /api/manga/:id` — tomo completo con `pages[].dialogues[]` (OCR + morfología ya resuelta por el cliente desktop, ver [`docs/manga-ingest.md`](docs/manga-ingest.md))
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
- `POST /api/admin/upload` — `multipart/form-data` con campo `file` o `image`
- Manga (contrato completo en [`docs/manga-ingest.md`](docs/manga-ingest.md)):
  - `POST /api/admin/manga/upload-image` — `multipart/form-data`, campos `image` + `image_checksum` (sha256), dedup por checksum
  - `POST /api/admin/manga/ingest` — upsert de un tomo + sus páginas/diálogos, idempotente por `volume_id`
  - `GET /api/admin/manga`, `GET /api/admin/manga/:id/pages/:pageIndex`
  - `PATCH /api/admin/manga/:id/pages/:pageIndex/dialogues/:dialogueIndex`
  - `PUT /api/admin/manga/:id/pages/:pageIndex/image`, `DELETE /api/admin/manga/:id/pages/:pageIndex`

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
