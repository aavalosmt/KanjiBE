# Conversaciones multi-idioma — guía para la app iOS

Cómo consumir `/api/conversations` ahora que una conversación puede estar en japonés (`ja`) o en coreano (`ko`). Todo es lectura pública, sin autenticación.

## 1. Qué cambió

| Antes | Ahora |
|---|---|
| Todas las conversaciones eran japonesas | Cada conversación tiene `language` (`"ja"`, `"ko"`, …) |
| `GET /api/conversations` devolvía todo | Sin `language` devuelve **solo `ja`** (compatibilidad: versiones viejas de la app no ven coreano) |
| Los tokens siempre traían `colorType`/`color` (kuromoji) | En `ko` los tokens se escriben a mano: traen `gloss` (significado) y `note`, **sin** `colorType`/`color` |
| `level` era JLPT (`N5`…`N1`) | En `ko` es TOPIK (`TOPIK1`…`TOPIK6`) |

Una app que ya decodifica conversaciones japonesas sigue funcionando sin cambios: solo aparece el campo nuevo `language` en la respuesta.

## 2. Endpoints

### `GET /api/conversations` — lista (resúmenes, sin blocks)

| Query | Tipo | Default | Descripción |
|---|---|---|---|
| `language` | string | `ja` | Idioma del contenido (ISO 639-1). `all` = todos los idiomas |
| `topic` | string | — | Slug de topic (`travel`, …) |
| `level` | string | — | `N5`…`N1` (ja) o `TOPIK1`…`TOPIK6` (ko) |
| `page` | int | 1 | |
| `limit` | int | 20 | Máx. 100 |
| `lang` | string | `es` | Idioma de la **traducción** (overlay). No confundir con `language` |

> `language` = en qué idioma está escrita la conversación. `lang` = a qué idioma quieres la traducción. Ejemplo: `?language=ko&lang=es` → conversación en coreano con traducción al español.

```
GET /api/conversations?language=ko&topic=travel&page=1&limit=20
```

```json
{
  "data": [
    {
      "id": "0b7c…",
      "title": "편의점에서",
      "topic": "travel",
      "language": "ko",
      "level": "TOPIK1",
      "translation": "En la tienda de conveniencia",
      "translationLang": "es",
      "coverUrl": null
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 12 }
}
```

### `GET /api/conversations/:id` — conversación completa

Acepta `?lang=`. El id identifica una sola conversación, así que no hace falta pasar `language`. `404` → `{ "error": "Conversation not found" }`.

```json
{
  "id": "0b7c…",
  "title": "편의점에서",
  "topic": "travel",
  "language": "ko",
  "level": "TOPIK1",
  "translation": "En la tienda de conveniencia",
  "translationLang": "es",
  "coverUrl": null,
  "blocks": [
    {
      "id": "3f1a…",
      "type": "dialogue",
      "speaker": "점원 (Empleado)",
      "content": "봉투 필요하세요?",
      "translation": "¿Necesita bolsa?",
      "translationLang": "es",
      "notes": "Las bolsas se cobran aparte.",
      "tokens": [
        { "surface": "봉투", "lemma": "봉투", "gloss": "bolsa" },
        { "surface": "필요하세요?", "lemma": "필요하다", "gloss": "¿necesita?", "note": "-(으)세요 = terminación cortés" }
      ]
    }
  ],
  "createdAt": "2026-09-24T12:00:00.000Z",
  "updatedAt": "2026-09-24T12:00:00.000Z"
}
```

## 3. Modelos (Swift)

Todos los campos que pueden faltar son opcionales: la misma estructura decodifica `ja` y `ko`.

```swift
struct ConversationPage: Decodable {
    let data: [ConversationSummary]
    let pagination: Pagination
}

struct Pagination: Decodable {
    let page: Int
    let limit: Int
    let total: Int
}

struct ConversationSummary: Decodable, Identifiable {
    let id: String
    let title: String
    let topic: String
    let language: String          // "ja" | "ko" | …
    let level: String?            // "N5"… o "TOPIK1"…
    let translation: String?
    let translationLang: String
    let coverUrl: String?
}

struct Conversation: Decodable, Identifiable {
    let id: String
    let title: String
    let topic: String
    let language: String
    let level: String?
    let translation: String?
    let translationLang: String
    let coverUrl: String?
    let blocks: [ContentBlock]
    let createdAt: String
    let updatedAt: String
}

struct ContentBlock: Decodable, Identifiable {
    let id: String
    let type: BlockType
    let content: String?
    let translation: String?
    let translationLang: String?
    let speaker: String?
    let notes: String?
    let url: String?              // solo type == .image
    let caption: String?
    let tokens: [BlockToken]?
}

enum BlockType: String, Decodable {
    case text, header, dialogue, image
}

struct BlockToken: Decodable {
    let surface: String           // texto tal como aparece en content
    let lemma: String             // forma de diccionario
    // Solo ja (kuromoji):
    let reading: String?          // katakana
    let pos: String?
    let posEn: String?
    let colorType: String?        // verb, noun, particle, adverb, …
    let color: String?            // hex, p. ej. "#10B981"
    let inflectionEn: String?
    let grammarEn: String?
    // Solo ko (escritos a mano):
    let gloss: String?            // significado de la palabra
    let note: String?             // gramática / partícula
}

enum ContentLanguage: String {
    case japanese = "ja"
    case korean = "ko"
}
```

> Decodifica `language` como `String` (no como enum estricto) para que un idioma nuevo no rompa la app. Usa `ContentLanguage(rawValue:)` para decidir cómo mostrarlo y ten un caso por defecto.

## 4. Cómo mostrar `content`

### Japonés (`language == "ja"`)

Como hasta ahora: `content` trae markup de furigana.

```
[乗り換えて](furigana:の.り.か.え.て)ください
```

- Regex del span: `\[([^\]]+)\]\(furigana:([^)]+)\)`
- Grupo 1 = superficie (lo que se ve); grupo 2 = lecturas separadas por `.`, **una por carácter** de la superficie (kanji o kana), en orden. Los jukujikun no llevan puntos: `[今日](furigana:きょう)` → la lectura va sobre la palabra completa.
- Todo lo que queda fuera de los spans es texto plano (partículas, kana, puntuación).
- Los tokens (`colorType`/`color`) sirven para colorear por categoría y para abrir el detalle gramatical.

### Coreano (`language == "ko"`)

- `content` es **hangul plano, sin markup**. No apliques el parser de furigana (no encontraría nada, pero no hace falta correrlo).
- No hay `reading` ni `colorType`/`color`: muestra el texto sin colorear.
- **Traducción por palabra:** los `tokens` siguen el orden del texto y cada `surface` es un eojeol (palabra separada por espacios, con su partícula o terminación pegada, p. ej. `화장실은`). Para hacerlos tocables:
  1. Recorre `tokens` en orden y busca cada `surface` en `content` a partir de la posición donde terminó el anterior (`range(of:options:range:)`).
  2. Cada rango encontrado es un segmento tocable; lo que queda entre segmentos (espacios, puntuación sin token) es texto plano.
  3. Al tocar: muestra `gloss` como título, `lemma` como forma de diccionario (si es distinto de `surface`) y `note` si existe.
  4. Si un `surface` no aparece en el texto, ignora ese token.
- `tokens` puede faltar o venir vacío: entonces muestra solo `content` + `translation`.

### Común a ambos idiomas

- `speaker` trae el nombre en el idioma original y la traducción entre paréntesis: `"점원 (Empleado)"`, `"店員 (Mesero)"`. `"私 (Yo)"` / `"나 (Yo)"` es el viajero: úsalo para alinear la burbuja al lado del usuario.
- `notes` es un consejo cultural o gramatical de la línea (puede faltar).
- `translation` + `translationLang` ya vienen resueltos según `?lang=`. Si pides un idioma sin traducción, regresa el original (`es`) y `translationLang` lo indica.

## 5. UX sugerida

- Selector de idioma (ja / ko) en la lista de conversaciones, que manda `language=`. Recuerda la última selección en local.
- Filtro de nivel dependiente del idioma: `N5…N1` para ja, `TOPIK1…TOPIK6` para ko.
- Los topics (`GET /api/topics`) son compartidos: `travel` existe para los dos idiomas.
- Para decidir la fuente o el `locale` del texto (VoiceOver, TTS con `AVSpeechSynthesisVoice(language:)`), usa `ja-JP` o `ko-KR` según `language`.

## 6. Errores

| Caso | Respuesta |
|---|---|
| Id inexistente | `404 { "error": "Conversation not found" }` |
| `language` con un valor sin conversaciones | `200` con `data: []`, `total: 0` |
| `limit` > 100 | Se limita a 100 |
