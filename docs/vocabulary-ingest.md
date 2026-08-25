# Vocabulario — contrato de ingesta (cliente desktop OCR → backend)

Mismo contrato que `docs/manga-ingest.md`, para listas de vocabulario en vez de páginas de manga: páginas de imagen (p. ej. escaneos de hojas de vocabulario o mazos de tarjetas) con cajas delimitadoras posicionadas por palabra/entrada, en vez de por diálogo. El backend persiste y sirve el resultado; no re-tokeniza ni traduce nada de lo que llega aquí.

## 1. Autenticación

Mismo mecanismo que el resto de `/api/admin/*`: header `X-Admin-Key: <ADMIN_API_KEY>` o `Authorization: Bearer <ADMIN_API_KEY>`.

Sin header válido → `401`.

## 2. `POST /api/admin/vocabulary/upload-image`

`multipart/form-data`.

| Campo | Tipo | Descripción |
|---|---|---|
| `image` | archivo | png/jpg/webp/gif, máx. 30 MB |
| `image_checksum` | string | sha256 hex del archivo (con o sin prefijo `sha256:`), calculado por el cliente |

El servidor calcula su propio sha256 sobre los bytes recibidos — es la fuente de verdad para el dedup — y lo compara contra `image_checksum` para detectar corrupción en la subida. Si no coinciden: `400`.

Si ya existe una imagen con ese checksum, no se vuelve a escribir a disco: se responde la URL ya existente con `already_existed: true`.

Almacenamiento: disco local (`UPLOAD_DIR`), igual que `/api/admin/upload` y `/api/admin/manga/upload-image`. Encapsulado en `src/lib/vocabularyStorage.ts`.

Respuesta `200`:

```json
{ "image_url": "https://.../uploads/<uuid>.png", "already_existed": false }
```

## 3. `POST /api/admin/vocabulary/ingest`

`application/json`. Una o más páginas de una misma lista por request — sirve tanto para sincronizar una página suelta como para una lista completa en batch.

Las `image_url` referenciadas deben venir de la Sección 2 — este endpoint no sube binarios.

```json
{
  "schema_version": "1.0",
  "set_id": "b3a1e6f0-2c3d-4a9e-9f7a-1d2e3f4a5b6c",
  "title": "JLPT N5 — Unidad 1",
  "set_number": "1",
  "total_pages": 12,
  "cover_url": "https://.../n5_u1_cover.webp",
  "pages": [
    {
      "page_index": 0,
      "image_url": "https://.../n5_u1_p000.webp",
      "image_checksum": "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a1",
      "width": 1600,
      "height": 2400,
      "entries": [
        {
          "entry_box": { "x": 120, "y": 340, "width": 220, "height": 90 },
          "full_text": "食べる",
          "tokens": ["食べる"],
          "furigana": "[食べる](furigana:た.べる)",
          "morphology": [
            { "surface": "食べる", "pos": "verbo" }
          ]
        }
      ]
    }
  ]
}
```

`set_id` es generado por el cliente y es la clave de upsert — el servidor nunca genera uno nuevo. `tokens`, `furigana` y `morphology` se persisten tal cual llegan; el backend no los transforma, enriquece ni re-tokeniza.

`cover_url` es opcional — una imagen de portada de la lista, distinta de `pages[].image_url`. Si no se manda, queda `null`. Se puede setear o cambiar después con `PATCH /api/admin/vocabulary/:id` (ver Sección 5) sin volver a mandar páginas.

### Idempotencia

Reintentar la misma petición nunca duplica datos:

- **Lista:** upsert por `set_id`. Cada ingest sobreescribe `title`/`set_number`/`total_pages`/`cover_url` por completo — omitir uno de estos campos en un reintento posterior lo deja en `null`, no lo preserva.
- **Página:** upsert por `(set_id, page_index)`. Reemplaza sus entradas completas en cada ingest (no hace merge parcial de entradas dentro de una página).

### Versionado

`schema_version` no reconocida → `400` explícito. Versiones soportadas hoy: `"1.0"` (`SUPPORTED_VOCABULARY_SCHEMA_VERSIONS` en `src/validators.ts`).

### Respuesta `200`

```json
{ "set_id": "b3a1e6f0-...", "created": true, "pages_upserted": 1 }
```

## 4. Lectura pública (app iOS)

Sin auth, mismo estilo que `/api/stories`, `/api/lyrics` y `/api/manga`:

- `GET /api/vocabulary?page=&limit=` — resumen de listas (sin `pages`)
- `GET /api/vocabulary/:id` — lista completa con `pages[].entries[]`

## 5. Edición / administración

Bajo `/api/admin/vocabulary`, misma auth que la Sección 1:

| Método | Ruta | Acción |
|---|---|---|
| `GET` | `/api/admin/vocabulary` | Listar listas |
| `GET` | `/api/admin/vocabulary/:id` | Detalle de lista + páginas |
| `PATCH` | `/api/admin/vocabulary/:id` | Editar metadata de la lista (`title`, `set_number`, `cover_url`) |
| `GET` | `/api/admin/vocabulary/:id/pages/:pageIndex` | Detalle de página + entradas |
| `PATCH` | `/api/admin/vocabulary/:id/pages/:pageIndex/entries/:entryIndex` | Editar campos de una entrada |
| `PUT` | `/api/admin/vocabulary/:id/pages/:pageIndex/image` | Reemplazar imagen de la página (`multipart`, campo `image`) |
| `DELETE` | `/api/admin/vocabulary/:id/pages/:pageIndex` | Borrar página (cascada a sus entradas) |

UI en `/admin` → pestaña **Vocabulario**: lista de listas, grilla de páginas, y un editor por página con overlay de cajas delimitadoras sobre la imagen (click para seleccionar, arrastrar para reposicionar) junto a los campos de cada entrada. Borrar listas completas no está cubierto (extensión natural si hace falta).

## 6. Qué queda fuera a propósito (MVP)

- **Tokenización/traducción en el backend.** El cliente desktop entrega `tokens`/`morphology`/`furigana` ya resueltos; este backend los persiste sin tocarlos.
- **Object storage.** Disco local + volumen, igual que el resto del proyecto.
- **Auth por dispositivo / estado `pending_review`.** Backlog, no bloquea el MVP.

## Modelo de datos

Cuatro tablas nuevas (`prisma/schema.prisma`), no tocan `Story`/`Lyric`/`Conversation`/`Manga*`: `VocabularySet` → `VocabularyPage` → `VocabularyEntry`, más `VocabularyImageAsset` para el índice de dedup por checksum. Estructuralmente idéntico a `MangaVolume`/`MangaPage`/`MangaDialogue`/`MangaImageAsset` — mismo patrón de upsert granular por página y `PATCH` por entrada, en tablas propias y separadas.
