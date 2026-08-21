# Manga — contrato de ingesta (cliente desktop OCR → backend)

Contrato HTTP entre un procesador de escritorio (OCR + análisis morfológico sobre páginas de manga, GPU local) y este backend. El backend persiste y sirve el resultado; no re-tokeniza ni traduce nada de lo que llega aquí.

## 1. Autenticación

Mismo mecanismo que el resto de `/api/admin/*`: header `X-Admin-Key: <ADMIN_API_KEY>` o `Authorization: Bearer <ADMIN_API_KEY>`. No hay una clave separada para el cliente desktop por ahora — es una decisión deliberada de alcance (una sola persona, una sola máquina, mismo modelo de "una API key" que ya usa el resto del panel admin). Como la auth vive en un middleware aislado (`requireAdmin`), separar la clave del desktop de la del panel admin más adelante es un cambio localizado, no un rediseño.

Sin header válido → `401`.

## 2. `POST /api/admin/manga/upload-image`

`multipart/form-data`.

| Campo | Tipo | Descripción |
|---|---|---|
| `image` | archivo | png/jpg/webp/gif, máx. 30 MB |
| `image_checksum` | string | sha256 hex del archivo (con o sin prefijo `sha256:`), calculado por el cliente |

El servidor calcula su propio sha256 sobre los bytes recibidos — es la fuente de verdad para el dedup — y lo compara contra `image_checksum` para detectar corrupción en la subida. Si no coinciden: `400`.

Si ya existe una imagen con ese checksum, no se vuelve a escribir a disco: se responde la URL ya existente con `already_existed: true`. Deduplicación real, no cosmética — permite reintentar la subida sin generar duplicados.

Almacenamiento: disco local (`UPLOAD_DIR`), igual que `/api/admin/upload`. Encapsulado en `src/lib/mangaStorage.ts` para que migrar a un bucket (S3/R2) más adelante sea cambiar una sola función, no los endpoints.

Respuesta `200`:

```json
{ "image_url": "https://.../uploads/<uuid>.png", "already_existed": false }
```

## 3. `POST /api/admin/manga/ingest`

`application/json`. Una o más páginas de un mismo tomo por request — sirve tanto para sincronizar una página suelta como para un tomo completo en batch.

Las `image_url` referenciadas deben venir de la Sección 2 — este endpoint no sube binarios.

```json
{
  "schema_version": "1.0",
  "volume_id": "b3a1e6f0-2c3d-4a9e-9f7a-1d2e3f4a5b6c",
  "title": "MyDressUpDarling",
  "volume_number": "1",
  "total_pages": 180,
  "cover_url": "https://.../vol1_cover.webp",
  "pages": [
    {
      "page_index": 0,
      "image_url": "https://.../vol1_p000.webp",
      "image_checksum": "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a1",
      "width": 1600,
      "height": 2400,
      "dialogues": [
        {
          "dialogue_box": { "x": 120, "y": 340, "width": 220, "height": 90 },
          "full_text": "……ねぇねぇ",
          "tokens": ["……", "ねぇ", "ねぇ"],
          "furigana": "……ねぇねぇ",
          "morphology": [
            { "surface": "……", "pos": "símbolo" },
            { "surface": "ねぇ", "pos": "adverbio" }
          ]
        }
      ]
    }
  ]
}
```

`volume_id` es generado por el cliente y es la clave de upsert — el servidor nunca genera uno nuevo. `tokens`, `furigana` y `morphology` se persisten tal cual llegan; el backend no los transforma, enriquece ni re-tokeniza (eso ya lo resolvió el cliente desktop; la definición por palabra la resuelve la app de iOS contra su diccionario local).

`cover_url` es opcional — una imagen de portada del tomo, distinta de `pages[].image_url` (por ejemplo la carátula oficial en vez de la página 1). Si no se manda, queda `null`. Se puede setear o cambiar después con `PATCH /api/admin/manga/:id` (ver Sección 5) sin volver a mandar páginas.

### Idempotencia

Reintentar la misma petición nunca duplica datos:

- **Tomo:** upsert por `volume_id`. Cada ingest sobreescribe `title`/`volume_number`/`total_pages`/`cover_url` por completo — omitir uno de estos campos en un reintento posterior lo deja en `null`, no lo preserva.
- **Página:** upsert por `(volume_id, page_index)`. Reemplaza sus diálogos completos en cada ingest (no hace merge parcial de diálogos dentro de una página).

### Versionado

`schema_version` no reconocida → `400` explícito, en vez de intentar parsear igual. Versiones soportadas hoy: `"1.0"` (`SUPPORTED_MANGA_SCHEMA_VERSIONS` en `src/validators.ts`).

### Respuesta `200`

```json
{ "volume_id": "b3a1e6f0-...", "created": true, "pages_upserted": 1 }
```

## 4. Lectura pública (app iOS)

Sin auth, mismo estilo que `/api/stories` y `/api/lyrics`:

- `GET /api/manga?page=&limit=` — resumen de tomos (sin `pages`)
- `GET /api/manga/:id` — tomo completo con `pages[].dialogues[]`

## 5. Edición / administración

Bajo `/api/admin/manga`, misma auth que la Sección 1:

| Método | Ruta | Acción |
|---|---|---|
| `GET` | `/api/admin/manga` | Listar tomos |
| `GET` | `/api/admin/manga/:id` | Detalle de tomo + páginas |
| `PATCH` | `/api/admin/manga/:id` | Editar metadata del tomo (`title`, `volume_number`, `cover_url`) |
| `GET` | `/api/admin/manga/:id/pages/:pageIndex` | Detalle de página + diálogos |
| `PATCH` | `/api/admin/manga/:id/pages/:pageIndex/dialogues/:dialogueIndex` | Editar campos de un diálogo |
| `PUT` | `/api/admin/manga/:id/pages/:pageIndex/image` | Reemplazar imagen de la página (`multipart`, campo `image`) |
| `DELETE` | `/api/admin/manga/:id/pages/:pageIndex` | Borrar página (cascada a sus diálogos) |

UI en `/admin` → pestaña **Manga**: lista de tomos, grilla de páginas, y un editor por página con overlay de cajas delimitadoras sobre la imagen (click para seleccionar, arrastrar para reposicionar) junto a los campos de cada diálogo. Borrar tomos completos no está cubierto (extensión natural si hace falta).

## 6. Qué queda fuera a propósito (MVP)

- **Tokenización/traducción en el backend.** El cliente desktop entrega `tokens`/`morphology`/`furigana` ya resueltos; este backend los persiste sin tocarlos. No hay JMdict ni Gemini involucrados en esta ruta.
- **Object storage.** Disco local + volumen, igual que el resto del proyecto. Migrar a un bucket es un cambio aislado en `mangaStorage.ts` cuando el tamaño de las imágenes lo justifique.
- **Auth por dispositivo / estado `pending_review`.** Backlog para v1, no bloquea el MVP.

## Modelo de datos

Tres tablas nuevas (`prisma/schema.prisma`), no tocan `Story`/`Lyric`/`Conversation`: `MangaVolume` → `MangaPage` → `MangaDialogue`, más `MangaImageAsset` para el índice de dedup por checksum. A diferencia de `blocks` (columna JSON, reemplazo completo en cada `PUT`), estas son tablas relacionales reales — necesario para el upsert granular por página y el `PATCH` por diálogo que este contrato requiere.
