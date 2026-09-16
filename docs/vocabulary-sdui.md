# SDUI layout for vocabulary sets

`GET /api/vocabulary/:topic/:subtopic` (and its admin equivalent) carries a `layout` field: a small,
recursive tree describing how the client should arrange the `words` / `pages` / `example_sentences`
arrays already in the same response — columns, a table, a collapsed section, a carousel. It never
carries content of its own, only presentation, so the payload doesn't grow and there's a single source
of truth for the data.

It's computed automatically from the set's own content; an admin can override it per set. The node
schema is generic on purpose (see [src/lib/sdui.ts](../src/lib/sdui.ts)) so it can be reused by other
content types later without changing shape.

## Node types

Every node has a stable `id` and a `type`. Containers (`stack`, `collapsible`) have `children`; leaves
(`grid`, `table`, `carousel`) have a `data` binding.

| type | fields | meaning |
|---|---|---|
| `stack` | `title?`, `direction?: "vertical" \| "horizontal"` (default `vertical`), `children` | plain container, no data binding |
| `collapsible` | `title`, `collapsed: boolean`, `children` | collapsed/expandable section |
| `grid` | `columns: 1-6`, `data` | N-column grid; `columns: 1` is a plain vertical list |
| `table` | `data`, `tableColumns?: { key, label }[]` | rows in a table; omit `tableColumns` to use the client's default columns for that `data` key |
| `carousel` | `data` | horizontally swipeable, one item at a time |

`data` is one of `"words" | "pages" | "example_sentences"` — the array in the same vocabulary response
the node renders.

### Comparing two forms of a word (`variant`)

A `words` item may carry an optional second form of the same word —
`variant: { term, furigana, label }` (e.g. `食べさせる` labeled `"Causative"` next to the plain
`食べる`). It shares the word's one `translation`; there's no separate gloss per form.

A `table` bound to `data: "words"` can reference it with dot-path keys in `tableColumns`:
`"variant.term"`, `"variant.furigana"`, `"variant.label"`. A client resolving `tableColumns[].key`
should split on `.` and walk the path on each `words` item; when an item has no `variant`, that cell is
empty.

### Example

```json
{
  "id": "root", "type": "stack", "direction": "vertical",
  "children": [
    { "id": "content", "type": "grid", "columns": 2, "data": "words" },
    { "id": "examples", "type": "collapsible", "title": "Example sentences", "collapsed": true,
      "children": [{ "id": "examples-list", "type": "grid", "columns": 1, "data": "example_sentences" }] }
  ]
}
```

## Client contract: forward compatibility

New node types may be added later. A client that doesn't recognize a `type` must **not** error:
- If the unknown node has `children`, render them flattened into its parent (skip the wrapper).
- If it doesn't (an unknown leaf), skip it — don't guess how to bind its `data`.

This is what makes the tree safe to extend without a client release.

## Heuristic (default when there's no admin override)

- `content_type: "list"` — if **any** word has a `variant`, always a `table` over `words` with explicit
  columns `[{key:"term",label:"Term"}, {key:"variant.term",label:<first variant's label>}, {key:"translation",label:"Translation"}]`,
  regardless of word count. Otherwise: `words.length <= 12` → `grid` (`columns: 2`); else → `table`
  (default columns).
- `content_type: "image"` — always `carousel` over `pages`.
- `example_sentences.length > 0` — a `collapsible` (`collapsed: true`) wrapping a `grid` (`columns: 1`)
  over `example_sentences` is appended; omitted entirely when there are none.
- Root is always a `stack` with `direction: "vertical"`.

## Admin override

`PATCH /api/admin/vocabulary/:topic/:subtopic` accepts a `layout` field alongside `title`/`cover_url`:

- Omit `layout` → unchanged.
- `layout: null` → clears any stored override, reverts to the heuristic.
- `layout: <SduiNode>` → validated against the same recursive schema, stored, and returned as the
  effective layout on every subsequent `GET` for that set. An invalid node (bad `type`, missing a
  required field like `data` on a `grid`) is rejected with `400`.

A stored override that somehow becomes invalid (hand-edited DB row, schema drift) is never fatal — the
server discards it and serves the computed heuristic instead of 500ing.

Admin UI: `/admin` → a vocabulary set → **Diseño (SDUI)** panel — shows the effective layout as
pretty-printed JSON, "Guardar diseño" (PATCH the edited JSON) / "Usar automático" (`PATCH { layout: null }`).
