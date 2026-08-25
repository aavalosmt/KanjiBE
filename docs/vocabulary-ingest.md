# Vocabulario — contrato de ingesta (cliente desktop OCR → backend)

Listas de vocabulario, dirigidas por una taxonomía de dos niveles (`topic`/`subtopic`) en vez de un id opaco — p. ej. `body`/`general`, `body`/`fingers`. Cada `(topic, subtopic)` es **un** set de vocabulario, y cada set tiene uno de dos formatos de contenido:

- **`content_type: "image"`** — igual que Manga: páginas de imagen con cajas delimitadoras posicionadas por palabra (para diagramas tipo "partes del cuerpo").
- **`content_type: "list"`** — un array plano de `{ term, furigana, translation }`, sin imagen (para listas de palabras simples).

El backend persiste y sirve el resultado; no re-tokeniza ni traduce nada de lo que llega aquí.

## 1. Autenticación

Mismo mecanismo que el resto de `/api/admin/*`: header `X-Admin-Key: <ADMIN_API_KEY>` o `Authorization: Bearer <ADMIN_API_KEY>`.

Sin header válido → `401`.

## 2. Taxonomía: `Topic` y `Subtopic`

`topic` y `subtopic` no son texto libre: deben ser slugs ya registrados, igual que `Conversation.topic` (ver `docs/spec.md` sección 3.5).

- `POST /api/admin/topics` `{ slug, label }` — registra un topic (snake_case, único). 409 si ya existe.
- `POST /api/admin/subtopics` `{ topicSlug, slug, label }` — registra un subtopic bajo un topic ya existente. `400` si el topic no existe; `409` si el `(topicSlug, slug)` ya existe.
- `GET /api/topics` — lista topics registrados.
- `GET /api/subtopics?topic=body` — lista subtopics (opcionalmente filtrados por topic).

Ingestar contra un `topic`/`subtopic` no registrado → `400` explícito, antes de tocar la base de datos.

## 3. `POST /api/admin/vocabulary/upload-image`

Solo aplica a sets `content_type: "image"`. Idéntico a `POST /api/admin/manga/upload-image`:

`multipart/form-data`.

| Campo | Tipo | Descripción |
|---|---|---|
| `image` | archivo | png/jpg/webp/gif, máx. 30 MB |
| `image_checksum` | string | sha256 hex del archivo (con o sin prefijo `sha256:`), calculado por el cliente |

El servidor recalcula su propio sha256 — fuente de verdad para el dedup — y lo compara contra `image_checksum`. Si no coinciden: `400`. Si ya existe una imagen con ese checksum, no se reescribe: se responde la URL existente con `already_existed: true`.

Respuesta `200`: `{ "image_url": "https://.../uploads/<uuid>.png", "already_existed": false }`

## 4. `POST /api/admin/vocabulary/ingest`

`application/json`. Un set completo por request (todas sus páginas+entradas, o todas sus palabras). `content_type` decide qué campos aplican.

### Formato imagen

```json
{
  "schema_version": "1.0",
  "topic": "body",
  "subtopic": "general",
  "title": "Body parts — general",
  "content_type": "image",
  "cover_url": "https://.../body_cover.webp",
  "pages": [
    {
      "page_index": 0,
      "image_url": "https://.../body_p000.webp",
      "image_checksum": "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a1",
      "width": 1600,
      "height": 2400,
      "entries": [
        {
          "entry_box": { "x": 120, "y": 340, "width": 220, "height": 90 },
          "full_text": "頭",
          "tokens": ["頭"],
          "furigana": "[頭](furigana:あたま)",
          "morphology": [{ "surface": "頭", "pos": "noun" }]
        }
      ]
    }
  ]
}
```

### Formato lista

```json
{
  "schema_version": "1.0",
  "topic": "body",
  "subtopic": "fingers",
  "title": "Fingers",
  "content_type": "list",
  "words": [
    { "term": "指", "furigana": "[指](furigana:ゆび)", "translation": "finger" },
    { "term": "親指", "furigana": "[親指](furigana:おや.ゆび)", "translation": "thumb" }
  ]
}
```

`cover_url` es opcional en ambos formatos — si no se manda, queda `null`. Se puede setear o cambiar después con `PATCH /api/admin/vocabulary/:topic/:subtopic` sin volver a mandar páginas/palabras.

### Idempotencia

Reintentar la misma petición nunca duplica datos:

- **Set:** upsert por `(topic, subtopic)`. Cada ingest sobreescribe `title`/`cover_url`/`content_type` por completo.
- **Páginas** (formato imagen): upsert por `(topic, subtopic, page_index)`. Reemplaza sus entradas completas en cada ingest.
- **Palabras** (formato lista): reemplazo completo del array en cada ingest (no hace merge parcial).
- **Cambiar `content_type` en un reingest** convierte el set: si pasa de `image` a `list`, borra sus páginas/entradas; si pasa de `list` a `image`, borra sus palabras.

### Versionado

`schema_version` no reconocida → `400` explícito. Versiones soportadas hoy: `"1.0"` (`SUPPORTED_VOCABULARY_SCHEMA_VERSIONS` en `src/validators.ts`).

### Respuesta `200`

```json
{ "topic": "body", "subtopic": "general", "created": true, "item_count": 1 }
```

## 5. Lectura pública (app iOS)

Sin auth, mismo estilo que `/api/stories`, `/api/lyrics` y `/api/manga`:

- `GET /api/vocabulary?page=&limit=&topic=` — resumen de sets (sin `pages`/`words`), filtrable por `topic`
- `GET /api/vocabulary/:topic/:subtopic` — set completo: `pages[].entries[]` si es `content_type: "image"`, `words[]` si es `content_type: "list"` (el array no aplicable siempre vuelve vacío, no `null`/ausente)

## 6. Edición / administración

Bajo `/api/admin/vocabulary`, misma auth que la Sección 1:

| Método | Ruta | Acción |
|---|---|---|
| `GET` | `/api/admin/vocabulary` | Listar sets |
| `GET` | `/api/admin/vocabulary/:topic/:subtopic` | Detalle de set |
| `PATCH` | `/api/admin/vocabulary/:topic/:subtopic` | Editar metadata (`title`, `cover_url`) |
| `GET` | `/api/admin/vocabulary/:topic/:subtopic/pages/:pageIndex` | Detalle de página + entradas (formato imagen) |
| `PATCH` | `/api/admin/vocabulary/:topic/:subtopic/pages/:pageIndex/entries/:entryIndex` | Editar una entrada (formato imagen) |
| `PUT` | `/api/admin/vocabulary/:topic/:subtopic/pages/:pageIndex/image` | Reemplazar imagen de la página (formato imagen) |
| `DELETE` | `/api/admin/vocabulary/:topic/:subtopic/pages/:pageIndex` | Borrar página (formato imagen, cascada a sus entradas) |
| `PATCH` | `/api/admin/vocabulary/:topic/:subtopic/words/:wordIndex` | Editar una palabra (formato lista) |
| `DELETE` | `/api/admin/vocabulary/:topic/:subtopic/words/:wordIndex` | Borrar una palabra (formato lista) |

UI en `/admin` → pestaña **Vocabulario**: lista de sets (filtrable por topic), y por set: el editor de páginas con overlay de cajas (formato imagen) o un editor de filas término/furigana/traducción (formato lista), según corresponda. Borrar sets completos no está cubierto (extensión natural si hace falta).

## 7. Qué queda fuera a propósito (MVP)

- **Tokenización/traducción en el backend.** El cliente entrega el contenido ya resuelto; este backend lo persiste sin tocarlo.
- **Object storage.** Disco local + volumen, igual que el resto del proyecto.
- **Auth por dispositivo / estado `pending_review`.** Backlog, no bloquea el MVP.

## Modelo de datos

`VocabularySet` (clave única `[topic, subtopic]`) más, según `content_type`: `VocabularyPage` → `VocabularyEntry` (formato imagen, estructuralmente igual a `MangaPage`/`MangaDialogue`) o `VocabularyWord` (formato lista, tabla plana). `VocabularyImageAsset` para el índice de dedup por checksum de imágenes (formato imagen). `Topic`/`Subtopic` son el registro compartido con `Conversation.topic` — ver `docs/spec.md` sección 3.5.
