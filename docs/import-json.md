# Importar cuentos, canciones y conversaciones (JSON)

## Tokenizar con Gemini

En `/admin/#/import` pega japonés crudo, elige el tipo (**Cuento**, **Canción**, **Conversación** o **Auto**) y pulsa **Tokenizar con Gemini**. El backend llama a `gemini-2.5-flash` con structured output y rellena el JSON, incluyendo furigana y (para conversaciones) el `speaker` de cada línea.

Variable: `GEMINI_API_KEY` (opcional `GEMINI_MODEL`). Sin key, el botón responde 503.

El panel admin acepta un JSON generado por otro agente. Pégalo en `/admin/#/import` o `POST /api/admin/import` con `X-Admin-Key`.

## Forma del JSON

```json
{
  "stories": [ /* cuentos */ ],
  "lyrics": [ /* canciones */ ],
  "conversations": [ /* conversaciones */ ]
}
```

También vale un solo objeto de cuento (`title` + `level`), de canción (`title` + `artist`) o de conversación (`title` + `topic`).

Si mandas `id` y ya existe, se actualiza. Si no hay `id`, se crea uno nuevo.

## Story

| Campo | Obligatorio | Notas |
| --- | --- | --- |
| `title` | sí | Japonés, p. ej. `本文` |
| `level` | sí | `N5` `N4` `N3` `N2` `N1` |
| `translation` | no | Título en español |
| `coverUrl` | no | URL absoluta |
| `blocks` | no | Ordenado |

## Lyric

Igual, pero `artist` en vez de `level`. `youtubeUrl` es opcional (`https://youtu.be/…` o `youtube.com/watch?v=`). `level` también es opcional aquí.

## Conversation

Igual, pero `topic` (obligatorio) en vez de `level`. `level` es opcional, igual que en Lyric.

`topic` no es texto libre: debe ser el `slug` de un tema ya registrado (ver `GET /api/topics`). Si el slug no existe, ese item del batch falla con un error individual ("Unknown topic…") sin tumbar el resto del import. Crea el tema antes con `POST /api/admin/topics { "slug", "label" }`, o desde el botón "+ Nuevo" en el selector de tema del panel admin.

## Bloques

`type` es `text`, `header`, `image` o `dialogue`.

- `text` / `header`: `content` obligatorio. Furigana: `[家族](furigana:か.ぞく)`
- `image`: `url` obligatorio; `caption` opcional
- `dialogue` (solo tiene sentido en conversaciones): `content` y `speaker` obligatorios, p. ej. `speaker: "Empleado"`
- `translation` opcional en todos

## Prompt para el otro agente

Copia esto:

```
Genera JSON para KanjiBE. Responde SOLO con un objeto JSON válido, sin markdown.

Forma:
{
  "stories": [{ "title", "level", "translation", "coverUrl", "blocks" }],
  "lyrics": [{ "title", "artist", "translation", "coverUrl", "blocks" }],
  "conversations": [{ "title", "topic", "level", "translation", "coverUrl", "blocks" }]
}

blocks (stories/lyrics): array de { "type": "text"|"header"|"image", "content"?, "translation"?, "url"?, "caption"? }
blocks (conversations): array de { "type": "dialogue"|"text"|"header"|"image", "speaker"? (obligatorio si type=dialogue), "content"?, "translation"?, "url"?, "caption"? }
- text/header/dialogue: content con furigana [漢字](furigana:かん.じ). Varios kanji: か.ぞく. Okurigana: た.べる
- image: url absoluta
level: N5|N4|N3|N2|N1
topic: slug corto en snake_case, ej. convenience_store, immigration_interview
No inventes ids. coverUrl puede ser null.
```

Ejemplo completo: `docs/examples/import.sample.json`.
