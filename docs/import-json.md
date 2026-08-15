# Importar cuentos y canciones (JSON)

## Tokenizar con Gemini

En `/admin/#/import` pega japonés crudo y pulsa **Tokenizar con Gemini**. El backend llama a `gemini-2.5-flash` con structured output y rellena el JSON.

Variable: `GEMINI_API_KEY` (opcional `GEMINI_MODEL`). Sin key, el botón responde 503.

El panel admin acepta un JSON generado por otro agente. Pégalo en `/admin/#/import` o `POST /api/admin/import` con `X-Admin-Key`.

## Forma del JSON

```json
{
  "stories": [ /* cuentos */ ],
  "lyrics": [ /* canciones */ ]
}
```

También vale un solo objeto de cuento (`title` + `level`) o de canción (`title` + `artist`).

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

Igual, pero `artist` en vez de `level`. `youtubeUrl` es opcional (`https://youtu.be/…` o `youtube.com/watch?v=`).

## Bloques

`type` es `text`, `header` o `image`.

- `text` / `header`: `content` obligatorio. Furigana: `[家族](furigana:か.ぞく)`
- `image`: `url` obligatorio; `caption` opcional
- `translation` opcional en todos

## Prompt para el otro agente

Copia esto:

```
Genera JSON para KanjiBE. Responde SOLO con un objeto JSON válido, sin markdown.

Forma:
{
  "stories": [{ "title", "level", "translation", "coverUrl", "blocks" }],
  "lyrics": [{ "title", "artist", "translation", "coverUrl", "blocks" }]
}

blocks: array de { "type": "text"|"header"|"image", "content"?, "translation"?, "url"?, "caption"? }
- text/header: content con furigana [漢字](furigana:かん.じ). Varios kanji: か.ぞく. Okurigana: た.べる
- image: url absoluta
level: N5|N4|N3|N2|N1
No inventes ids. coverUrl puede ser null.
```

Ejemplo completo: `docs/examples/import.sample.json`.
