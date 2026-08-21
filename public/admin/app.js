const KEY = "kanjibe.adminKey";
const app = document.querySelector("#app");
const toastEl = document.querySelector("#toast");

function getKey() {
  return localStorage.getItem(KEY) ?? "";
}

function setKey(value) {
  localStorage.setItem(KEY, value);
}

function clearKey() {
  localStorage.removeItem(KEY);
}

function toast(message, kind = "") {
  toastEl.hidden = false;
  toastEl.className = kind;
  toastEl.textContent = message;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    toastEl.hidden = true;
  }, 3200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function openTopicModal() {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.className = "modal-backdrop";
    host.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="topic-modal-title">
        <h2 id="topic-modal-title">Nuevo tema</h2>
        <p class="muted">Aparecer\u00e1 en el selector de tema y en el filtro de la lista.</p>
        <label class="field">
          <span>Nombre</span>
          <input id="topic-modal-label" placeholder="Aeropuerto" autocomplete="off" />
        </label>
        <label class="field">
          <span>Slug</span>
          <input id="topic-modal-slug" placeholder="airport" autocomplete="off" />
        </label>
        <div class="actions">
          <button class="primary" id="topic-modal-create" type="button">Crear</button>
          <button class="ghost" id="topic-modal-cancel" type="button">Cancelar</button>
        </div>
      </div>
    `;
    document.body.append(host);

    const labelInput = host.querySelector("#topic-modal-label");
    const slugInput = host.querySelector("#topic-modal-slug");
    const createButton = host.querySelector("#topic-modal-create");
    labelInput.focus();

    let slugTouched = false;
    slugInput.addEventListener("input", () => {
      slugTouched = true;
    });
    labelInput.addEventListener("input", () => {
      if (!slugTouched) slugInput.value = slugify(labelInput.value);
    });

    function onKeydown(event) {
      if (event.key === "Escape") close(null);
      if (event.key === "Enter") {
        event.preventDefault();
        void create();
      }
    }

    function close(result) {
      document.removeEventListener("keydown", onKeydown);
      host.remove();
      resolve(result);
    }

    async function create() {
      const label = labelInput.value.trim();
      const slug = slugInput.value.trim();
      if (!label || !slug) {
        toast("Nombre y slug son obligatorios", "error");
        return;
      }
      createButton.disabled = true;
      createButton.textContent = "Creando\u2026";
      try {
        const topic = await api("/api/admin/topics", {
          method: "POST",
          body: JSON.stringify({ slug, label })
        });
        close(topic);
      } catch (error) {
        toast(error.message, "error");
        createButton.disabled = false;
        createButton.textContent = "Crear";
      }
    }

    host.addEventListener("click", (event) => {
      if (event.target === host) close(null);
    });
    document.addEventListener("keydown", onKeydown);
    host.querySelector("#topic-modal-cancel").addEventListener("click", () => close(null));
    createButton.addEventListener("click", () => {
      void create();
    });
  });
}

function isKanji(char) {
  const code = char.codePointAt(0) ?? 0;
  return code >= 0x4e00 && code <= 0x9faf;
}

function splitRuns(surface) {
  const runs = [];
  for (const char of surface) {
    const kind = isKanji(char) ? "kanji" : "kana";
    const last = runs.at(-1);
    if (last && last.kind === kind) last.text += char;
    else runs.push({ kind, text: char });
  }
  return runs;
}

function rubyNode(base, reading) {
  const ruby = document.createElement("ruby");
  ruby.append(base);
  const rt = document.createElement("rt");
  rt.textContent = reading;
  ruby.append(rt);
  return ruby;
}

function assignPerKanjiChar(runs, parts) {
  const frag = document.createDocumentFragment();
  let index = 0;
  for (const run of runs) {
    if (run.kind === "kana") {
      frag.append(run.text);
      continue;
    }
    for (const char of run.text) {
      frag.append(rubyNode(char, parts[index] ?? ""));
      index += 1;
    }
  }
  return frag;
}

function trySequential(runs, parts) {
  const frag = document.createDocumentFragment();
  let index = 0;
  for (const run of runs) {
    if (run.kind === "kanji") {
      if (index >= parts.length) return null;
      frag.append(rubyNode(run.text, parts[index]));
      index += 1;
      continue;
    }
    if (index < parts.length && parts[index] === run.text) {
      index += 1;
    }
    frag.append(run.text);
  }
  return index === parts.length ? frag : null;
}

function renderToken(surface, reading) {
  const runs = splitRuns(surface);
  const parts = reading.split(".");
  const kanjiChars = [...surface].filter(isKanji).length;

  if (parts.length === kanjiChars && kanjiChars > 0) {
    return assignPerKanjiChar(runs, parts);
  }

  const sequential = trySequential(runs, parts);
  if (sequential) return sequential;

  return rubyNode(surface, reading);
}

function renderFurigana(text) {
  const wrap = document.createElement("div");
  wrap.className = "preview-jp";
  const pattern = /\[([^\]]+)\]\(furigana:([^)]+)\)/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > last) wrap.append(text.slice(last, match.index));
    wrap.append(renderToken(match[1], match[2]));
    last = match.index + match[0].length;
  }
  if (last < text.length) wrap.append(text.slice(last));
  if (!text) wrap.textContent = "…";
  return wrap;
}

function parseRoute() {
  const raw = location.hash.replace(/^#/, "") || "/stories";
  const parts = raw.split("/").filter(Boolean);
  return {
    section: parts[0] ?? "stories",
    id: parts[1] ? decodeURIComponent(parts[1]) : undefined,
    rest: parts.slice(2).map(decodeURIComponent)
  };
}

function go(hash) {
  location.hash = hash;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (getKey()) headers.set("X-Admin-Key", getKey());
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    clearKey();
    go("/login");
    throw new Error("No autorizado");
  }
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `Error ${res.status}`);
  }
  return data;
}

async function requireSession() {
  if (!getKey()) {
    go("/login");
    return false;
  }
  try {
    await api("/api/admin/session");
    return true;
  } catch {
    return false;
  }
}

function layout(active, body) {
  return `
    <header class="topbar">
      <div class="brand">
        <strong>KanjiBE</strong>
        <span>Panel admin</span>
      </div>
      <nav class="nav">
        <a href="#/stories" class="${active === "stories" ? "active" : ""}">Historias</a>
        <a href="#/lyrics" class="${active === "lyrics" ? "active" : ""}">Letras</a>
        <a href="#/conversations" class="${active === "conversations" ? "active" : ""}">Conversaciones</a>
        <a href="#/manga" class="${active === "manga" ? "active" : ""}">Manga</a>
        <a href="#/search" class="${active === "search" ? "active" : ""}">Buscar</a>
        <a href="#/import" class="${active === "import" ? "active" : ""}">Importar</a>
        <button class="ghost" id="logout" type="button">Salir</button>
      </nav>
    </header>
    <main class="wrap">${body}</main>
  `;
}

function renderLogin() {
  app.innerHTML = `
    <main class="login">
      <div class="kicker">KanjiBE</div>
      <h1>Consola de contenido</h1>
      <p class="muted">Entra con la misma <code>ADMIN_API_KEY</code> del servidor.</p>
      <form id="login-form">
        <label class="field">
          <span>API key</span>
          <input id="api-key" type="password" autocomplete="off" required />
        </label>
        <button class="primary" type="submit">Entrar</button>
      </form>
    </main>
  `;

  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = document.querySelector("#api-key").value.trim();
    setKey(value);
    try {
      await api("/api/admin/session");
      go("/stories");
    } catch (error) {
      clearKey();
      toast(error.message, "error");
    }
  });
}

function bindLogout() {
  document.querySelector("#logout")?.addEventListener("click", () => {
    clearKey();
    go("/login");
  });
}

function coverMarkup(url) {
  if (!url) return `<div class="cover"></div>`;
  return `<img class="cover" src="${escapeHtml(url)}" alt="" />`;
}

function bindGeminiModelSelect() {
  const modelSelect = document.querySelector("#tokenize-model");
  if (!modelSelect) return;
  const storedModel = localStorage.getItem("kanjibe.geminiModel");
  void api("/api/admin/gemini/models")
    .then((catalog) => {
      const current = storedModel || catalog.default || "gemini-3.5-flash";
      modelSelect.replaceChildren();
      for (const id of catalog.models) {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = id;
        if (id === current) option.selected = true;
        modelSelect.append(option);
      }
      if (current && ![...modelSelect.options].some((item) => item.value === current)) {
        const option = document.createElement("option");
        option.value = current;
        option.textContent = current;
        option.selected = true;
        modelSelect.prepend(option);
      }
    })
    .catch(() => {
      if (storedModel) modelSelect.value = storedModel;
    });
  modelSelect.addEventListener("change", () => {
    localStorage.setItem("kanjibe.geminiModel", modelSelect.value);
  });
}

function formatTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(total / 60);
  const s = (total % 60).toFixed(2).padStart(5, "0");
  return `${String(m).padStart(2, "0")}:${s}`;
}

async function showLrcPreview(id, host) {
  host.insertAdjacentHTML(
    "beforeend",
    `<div id="lrc-preview" class="preview-card search-panel"><p class="muted">Cargando letra…</p></div>`
  );
  const pane = host.querySelector("#lrc-preview") ?? host;
  try {
    const preview = await api(`/api/admin/lrclib/preview?id=${id}`);
    const langClass = preview.language.japanese ? "ok" : "error";
    pane.outerHTML = `
      <section id="lrc-preview" class="preview-card">
        <div class="kicker">${escapeHtml(preview.language.label)}</div>
        <h2>${escapeHtml(preview.title)}</h2>
        <p class="muted">${escapeHtml(preview.artist)}${preview.album ? ` · ${escapeHtml(preview.album)}` : ""}</p>
        <p class="muted">${preview.synced ? "Con timestamps" : "Sin timestamps"} · ${preview.lineCount} líneas</p>
        ${preview.language.japanese ? "" : `<p class="muted">Esto no parece japonés. No la guardes si buscabas JP.</p>`}
        <ol class="lyric-preview">
          ${preview.lines
            .map(
              (line) =>
                `<li><span class="muted">${formatTime(line.startTime)}</span> ${escapeHtml(line.text)}</li>`
            )
            .join("")}
        </ol>
        <label class="field">
          <span>YouTube (opcional)</span>
          <input id="lrc-youtube" placeholder="https://youtu.be/…" />
        </label>
        <div class="actions">
          <button class="primary" id="lrc-save" type="button" ${preview.lineCount ? "" : "disabled"}>
            Sí, guardar esta
          </button>
          <button class="ghost" id="lrc-cancel" type="button">Otra</button>
        </div>
      </section>
    `;
    document.querySelector("#lrc-cancel")?.addEventListener("click", () => {
      document.querySelector("#lrc-preview")?.remove();
    });
    document.querySelector("#lrc-save")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Guardando…";
      try {
        const youtubeUrl = document.querySelector("#lrc-youtube")?.value.trim() || null;
        const created = await api("/api/admin/lrclib/import", {
          method: "POST",
          body: JSON.stringify({
            id: preview.id,
            youtubeUrl,
            model: localStorage.getItem("kanjibe.geminiModel") || "gemini-3.5-flash"
          })
        });
        if (created.usedGemini) {
          toast("Guardada con furigana y traducción", "ok");
        } else {
          toast(created.geminiError || "Guardada sin Gemini (sin traducción)", "error");
        }
        go(`/lyrics/${created.id}`);
      } catch (error) {
        toast(error.message, "error");
        button.disabled = false;
        button.textContent = "Sí, guardar esta";
      }
    });
    void langClass;
  } catch (error) {
    toast(error.message, "error");
    document.querySelector("#lrc-preview")?.remove();
  }
}

function bindLrcLibSearch() {
  const input = document.querySelector("#lrclib-q");
  const results = document.querySelector("#lrclib-results");
  if (!input || !results) return;

  const run = async () => {
    const q = input.value.trim();
    if (!q) {
      toast("Escribe artista o canción", "error");
      return;
    }
    results.textContent = "Buscando…";
    try {
      const data = await api(`/api/admin/lrclib/search?q=${encodeURIComponent(q)}`);
      if (!data.data.length) {
        results.innerHTML = `<p class="muted">Sin resultados</p>`;
        return;
      }
      results.innerHTML = data.data
        .map(
          (track) => `
        <article class="search-hit">
          <div>
            <strong>${escapeHtml(track.title)}</strong>
            <p class="muted">${escapeHtml(track.artist)}${track.album ? ` · ${escapeHtml(track.album)}` : ""}</p>
            <p class="muted">${track.synced ? "synced" : track.hasLyrics ? "letra plana" : "sin letra"}</p>
          </div>
          <button class="ghost" data-preview="${track.id}" type="button" ${track.hasLyrics ? "" : "disabled"}>Ver letra</button>
        </article>`
        )
        .join("");
      results.querySelectorAll("[data-preview]").forEach((button) => {
        button.addEventListener("click", () => {
          void showLrcPreview(Number(button.dataset.preview), results);
        });
      });
    } catch (error) {
      results.textContent = "";
      toast(error.message, "error");
    }
  };

  document.querySelector("#lrclib-search")?.addEventListener("click", () => {
    void run();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void run();
    }
  });
}

function kindMeta(kind) {
  if (kind === "stories") {
    return { kicker: (item) => item.level, plural: "Historias", singular: "historia", lrclib: false };
  }
  if (kind === "lyrics") {
    return { kicker: (item) => item.artist, plural: "Letras", singular: "letra", lrclib: true };
  }
  return { kicker: (item) => item.topic, plural: "Conversaciones", singular: "conversación", lrclib: false };
}

function renderList(kind, items, options = {}) {
  const { topics = [], selectedTopic = "" } = options;
  const meta = kindMeta(kind);
  const cards = items.length
    ? items
        .map(
          (item) => `
        <article class="card item">
          ${coverMarkup(item.coverUrl)}
          <div class="item-body">
            <div class="kicker">${escapeHtml(meta.kicker(item))}</div>
            <h2>${escapeHtml(item.title)}</h2>
            <p class="muted">${escapeHtml(item.translation ?? "")}</p>
            <div class="actions">
              <a class="primary" href="#/${kind}/${encodeURIComponent(item.id)}">Editar</a>
              <button class="danger" data-del="${escapeHtml(item.id)}" type="button">Borrar</button>
            </div>
          </div>
        </article>`
        )
        .join("")
    : `<div class="empty"><h2>No hay ${meta.plural.toLowerCase()} todavía</h2><p class="muted">Crea la primera desde este panel.</p></div>`;

  app.innerHTML = layout(
    kind,
    `
      <div class="row">
        <div>
          <div class="kicker">Contenido</div>
          <h1>${meta.plural}</h1>
        </div>
        <div class="actions">
          <a class="ghost" href="#/import">Importar JSON</a>
          <a class="primary" href="#/${kind}/new">Nueva ${meta.singular}</a>
        </div>
      </div>
      ${
        meta.lrclib
          ? `<section class="editor pad search-panel">
        <label class="field">
          <span>Buscar en LRCLib</span>
          <div class="cover-row">
            <input id="lrclib-q" placeholder="Blue Bird Ikimonogakari" />
            <button class="primary" id="lrclib-search" type="button">Buscar</button>
          </div>
        </label>
        <div id="lrclib-results"></div>
      </section>`
          : ""
      }
      ${
        kind === "conversations"
          ? `<section class="editor pad search-panel">
        <label class="field">
          <span>Filtrar por tema</span>
          <select id="topic-filter">
            <option value="">Todos</option>
            ${topics
              .map(
                (t) =>
                  `<option value="${escapeHtml(t.slug)}" ${selectedTopic === t.slug ? "selected" : ""}>${escapeHtml(t.label)}</option>`
              )
              .join("")}
          </select>
        </label>
      </section>`
          : ""
      }
      <section class="grid">${cards}</section>
    `
  );
  bindLogout();
  if (meta.lrclib) bindLrcLibSearch();

  document.querySelector("#topic-filter")?.addEventListener("change", async (event) => {
    const topic = event.target.value;
    try {
      const list = await api(`/api/conversations?limit=100${topic ? `&topic=${encodeURIComponent(topic)}` : ""}`);
      renderList("conversations", list.data, { topics, selectedTopic: topic });
    } catch (error) {
      toast(error.message, "error");
    }
  });

  app.querySelectorAll("[data-del]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("¿Borrar este contenido?")) return;
      try {
        await api(`/api/admin/${kind}/${button.dataset.del}`, { method: "DELETE" });
        toast("Borrado", "ok");
        await route();
      } catch (error) {
        toast(error.message, "error");
      }
    });
  });
}

function emptyBlock(type) {
  if (type === "image") return { type, url: "", caption: "", translation: "" };
  if (type === "dialogue") return { type, speaker: "", content: "", translation: "" };
  return { type, content: "", translation: "" };
}

function blockEditor(block, index, kind) {
  const wrapButton =
    block.type === "image"
      ? ""
      : `<button class="tiny" data-wrap="${index}" type="button">Furigana</button>`;
  const hiddenId = block.id
    ? `<input type="hidden" data-field="id" value="${escapeHtml(block.id)}" />`
    : "";
  const timeField =
    kind === "lyrics" && block.type !== "image"
      ? `<label class="field time-field">
          <span>Tiempo (s)</span>
          <input data-field="startTime" type="number" step="0.01" min="0" value="${
            block.startTime == null ? "" : escapeHtml(block.startTime)
          }" placeholder="0.00" />
        </label>`
      : "";
  const common = `
    ${hiddenId}
    <div class="block-head">
      <b>${block.type}</b>
      <div class="block-tools">
        ${wrapButton}
        <button class="tiny" data-up="${index}" type="button">↑</button>
        <button class="tiny" data-down="${index}" type="button">↓</button>
        <button class="tiny danger" data-remove="${index}" type="button">Quitar</button>
      </div>
    </div>
    ${timeField}
  `;

  const notesField =
    kind === "conversations"
      ? `<label class="field">
          <span>Notas</span>
          <input data-field="notes" value="${escapeHtml(block.notes)}" placeholder="Nota cultural o gramatical" />
        </label>`
      : "";

  if (block.type === "image") {
    return `
      <article class="block" data-index="${index}">
        ${common}
        <label class="field">
          <span>URL</span>
          <div class="upload-row">
            <input data-field="url" value="${escapeHtml(block.url)}" />
            <button class="ghost" data-upload="${index}" type="button">Subir</button>
          </div>
        </label>
        <label class="field">
          <span>Caption</span>
          <input data-field="caption" value="${escapeHtml(block.caption)}" />
        </label>
        <label class="field">
          <span>Traducción</span>
          <input data-field="translation" value="${escapeHtml(block.translation)}" />
        </label>
        ${notesField}
      </article>
    `;
  }

  const speakerField =
    block.type === "dialogue"
      ? `<label class="field">
          <span>Hablante</span>
          <input data-field="speaker" value="${escapeHtml(block.speaker)}" placeholder="Dependiente" />
        </label>`
      : "";

  return `
    <article class="block" data-index="${index}">
      ${common}
      ${speakerField}
      <label class="field">
        <span>Contenido</span>
        <textarea data-field="content" class="jp" lang="ja" spellcheck="false" autocomplete="off">${escapeHtml(block.content)}</textarea>
      </label>
      <label class="field">
        <span>Traducción</span>
        <input data-field="translation" value="${escapeHtml(block.translation)}" />
      </label>
      ${notesField}
    </article>
  `;
}

function shiftBlockTimes(root, delta) {
  const amount = Number(delta);
  if (!Number.isFinite(amount) || amount === 0) return 0;
  let changed = 0;
  root.querySelectorAll('[data-field="startTime"]').forEach((field) => {
    const current = field.value.trim();
    if (!current) return;
    const value = Number(current);
    if (!Number.isFinite(value)) return;
    field.value = String(Math.max(0, Number((value + amount).toFixed(3))));
    changed += 1;
  });
  return changed;
}

function blocksFromDom(root) {
  return [...root.querySelectorAll(".block")].map((node) => {
    const type = node.querySelector("b").textContent.trim();
    const block = { type };
    node.querySelectorAll("[data-field]").forEach((input) => {
      const key = input.dataset.field;
      const value = input.value.trim();
      if (!value) return;
      if (key === "startTime") {
        const seconds = Number(value);
        if (Number.isFinite(seconds) && seconds >= 0) block.startTime = seconds;
        return;
      }
      block[key] = value;
    });
    return block;
  });
}

function blockForJsonView(block, kind) {
  if (block.type === "image") {
    return {
      ...(block.id ? { id: block.id } : {}),
      type: "image",
      url: block.url || "",
      caption: block.caption ?? null,
      translation: block.translation ?? null,
      ...(kind === "conversations" ? { notes: block.notes ?? null } : {})
    };
  }
  const view = {
    ...(block.id ? { id: block.id } : {}),
    type: block.type,
    content: block.content || "",
    translation: block.translation ?? null
  };
  if (kind === "lyrics") view.startTime = block.startTime ?? null;
  if (block.type === "dialogue") view.speaker = block.speaker || "";
  if (kind === "conversations") view.notes = block.notes ?? null;
  return view;
}

function collectForm(form, { strict = false } = {}) {
  const fullJsonWrap = document.querySelector("#full-json-wrap");
  const fullJsonField = document.querySelector("#full-json");
  if (fullJsonWrap && !fullJsonWrap.classList.contains("hidden") && fullJsonField) {
    try {
      const parsed = parseFullJson(fullJsonField.value);
      const data = {
        title: parsed.title,
        translation: parsed.translation || "",
        coverUrl: parsed.coverUrl || "",
        level: parsed.level,
        artist: parsed.artist,
        topic: parsed.topic,
        youtubeUrl: parsed.youtubeUrl || ""
      };
      return { data, blocks: parsed.blocks };
    } catch (error) {
      if (strict) throw error;
      return { data: Object.fromEntries(new FormData(form).entries()), blocks: [] };
    }
  }
  const data = Object.fromEntries(new FormData(form).entries());
  return { data, blocks: blocksFromDom(form) };
}

function normalizeBlocksArray(parsed) {
  if (!Array.isArray(parsed)) throw new Error("El campo 'blocks' debe ser un array");
  return parsed.map((block) => ({
    type: ["image", "header", "dialogue"].includes(block.type) ? block.type : "text",
    ...(block.id ? { id: block.id } : {}),
    ...(block.content ? { content: block.content } : {}),
    ...(block.translation ? { translation: block.translation } : {}),
    ...(block.url ? { url: block.url } : {}),
    ...(block.caption ? { caption: block.caption } : {}),
    ...(block.speaker ? { speaker: block.speaker } : {}),
    ...(block.notes ? { notes: block.notes } : {}),
    ...(block.startTime != null && Number.isFinite(Number(block.startTime))
      ? { startTime: Number(block.startTime) }
      : {})
  }));
}

function parseFullJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("JSON inválido: " + error.message);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("El JSON debe ser un objeto");
  }
  return {
    title: typeof parsed.title === "string" ? parsed.title : "",
    translation: typeof parsed.translation === "string" ? parsed.translation : null,
    coverUrl: typeof parsed.coverUrl === "string" ? parsed.coverUrl : null,
    level: typeof parsed.level === "string" ? parsed.level : undefined,
    artist: typeof parsed.artist === "string" ? parsed.artist : "",
    topic: typeof parsed.topic === "string" ? parsed.topic : "",
    youtubeUrl: typeof parsed.youtubeUrl === "string" ? parsed.youtubeUrl : null,
    blocks: normalizeBlocksArray(parsed.blocks ?? [])
  };
}

function renderPreview(kind, form) {
  const { data, blocks } = collectForm(form);
  const pane = document.querySelector("#preview");
  pane.replaceChildren();

  const title = document.createElement("h2");
  title.textContent = data.title || "Sin título";
  const kicker = document.createElement("div");
  kicker.className = "kicker";
  kicker.textContent =
    kind === "stories"
      ? data.level || "Nivel"
      : kind === "lyrics"
        ? data.artist || "Artista"
        : data.topic || "Tema";
  pane.append(kicker, title);

  if (data.translation) {
    const tr = document.createElement("p");
    tr.className = "muted";
    tr.textContent = data.translation;
    pane.append(tr);
  }

  if (data.coverUrl) {
    const img = document.createElement("img");
    img.className = "preview-img";
    img.src = data.coverUrl;
    img.alt = "";
    pane.append(img);
  }

  if (data.youtubeUrl) {
    const link = document.createElement("a");
    link.href = data.youtubeUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "YouTube";
    pane.append(link);
  }

  for (const block of blocks) {
    if (block.startTime != null && block.startTime !== "") {
      const stamp = document.createElement("div");
      stamp.className = "muted preview-time";
      stamp.textContent = formatTime(block.startTime);
      pane.append(stamp);
    }
    if (block.type === "header") {
      const h = document.createElement("h2");
      h.append(renderFurigana(block.content ?? ""));
      pane.append(h);
    } else if (block.type === "image" && block.url) {
      const img = document.createElement("img");
      img.className = "preview-img";
      img.src = block.url;
      img.alt = block.caption ?? "";
      pane.append(img);
    } else {
      if (block.type === "dialogue" && block.speaker) {
        const speaker = document.createElement("div");
        speaker.className = "preview-speaker";
        speaker.textContent = block.speaker;
        pane.append(speaker);
      }
      pane.append(renderFurigana(block.content ?? ""));
    }
    if (block.translation) {
      const tr = document.createElement("p");
      tr.className = "preview-tr";
      tr.textContent = block.translation;
      pane.append(tr);
    }
    if (block.notes) {
      const note = document.createElement("p");
      note.className = "preview-note";
      note.textContent = block.notes;
      pane.append(note);
    }
  }
}

function wrapFurigana(textarea) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  if (!selected) {
    toast("Selecciona el texto que lleva furigana", "error");
    return;
  }
  const reading = prompt(`Lectura para 「${selected}」`, "");
  if (!reading) return;
  const token = `[${selected}](furigana:${reading})`;
  textarea.setRangeText(token, start, end, "end");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

async function uploadFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/webp,image/gif";
  input.className = "hidden-file";
  document.body.append(input);

  return new Promise((resolve, reject) => {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      const body = new FormData();
      body.append("file", file);
      try {
        const result = await api("/api/admin/upload", { method: "POST", body });
        resolve(result.url);
      } catch (error) {
        reject(error);
      }
    });
    input.click();
  });
}

function clipboardText(event) {
  const plain = event.clipboardData?.getData("text/plain");
  if (plain) return plain;
  const html = event.clipboardData?.getData("text/html");
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent ?? "";
}

function enablePlainPaste(root) {
  root.addEventListener("paste", (event) => {
    const field = event.target;
    if (
      !(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) ||
      field.type === "file" ||
      field.type === "password"
    ) {
      return;
    }
    const text = clipboardText(event);
    if (!text) return;
    event.preventDefault();
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    field.setRangeText(text, start, end, "end");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function bindEditor(kind, isNew, id) {
  const form = document.querySelector("#editor-form");
  const blocksRoot = document.querySelector("#blocks");
  let composing = false;

  const refreshPreview = () => renderPreview(kind, form);
  form.addEventListener("compositionstart", () => {
    composing = true;
  });
  form.addEventListener("compositionend", () => {
    composing = false;
    refreshPreview();
  });
  form.addEventListener("input", () => {
    if (!composing) refreshPreview();
  });
  enablePlainPaste(form);
  refreshPreview();

  const formFields = document.querySelector("#form-fields");
  const fullJsonWrap = document.querySelector("#full-json-wrap");
  const fullJsonField = document.querySelector("#full-json");

  const setView = (view) => {
    document.querySelectorAll(".view-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.view === view);
    });
    if (view === "json") {
      const { data, blocks } = collectForm(form);
      const obj = {
        title: data.title || "",
        translation: data.translation || null,
        coverUrl: data.coverUrl || null,
        level: data.level || null
      };
      if (kind === "lyrics") {
        obj.artist = data.artist || "";
        obj.youtubeUrl = data.youtubeUrl || null;
      }
      if (kind === "conversations") {
        obj.topic = data.topic || "";
      }
      obj.blocks = blocks.map((block) => blockForJsonView(block, kind));
      fullJsonField.value = JSON.stringify(obj, null, 2);
      formFields.classList.add("hidden");
      fullJsonWrap.classList.remove("hidden");
      formFields.querySelectorAll("[required]").forEach((field) => {
        field.dataset.wasRequired = "true";
        field.required = false;
      });
    } else {
      let parsed;
      try {
        parsed = parseFullJson(fullJsonField.value);
      } catch (error) {
        toast(error.message, "error");
        return;
      }
      form.elements.title.value = parsed.title;
      form.elements.translation.value = parsed.translation || "";
      form.elements.coverUrl.value = parsed.coverUrl || "";
      if (kind === "stories") {
        if (parsed.level) form.elements.level.value = parsed.level;
      } else if (kind === "lyrics") {
        form.elements.level.value = parsed.level || "";
        form.elements.artist.value = parsed.artist || "";
        form.elements.youtubeUrl.value = parsed.youtubeUrl || "";
      } else {
        form.elements.level.value = parsed.level || "";
        const topicSelect = form.elements.topic;
        if (parsed.topic && ![...topicSelect.options].some((opt) => opt.value === parsed.topic)) {
          const option = document.createElement("option");
          option.value = parsed.topic;
          option.textContent = `${parsed.topic} (sin registrar)`;
          topicSelect.append(option);
        }
        topicSelect.value = parsed.topic || "";
      }
      blocksRoot.innerHTML = parsed.blocks.map((block, index) => blockEditor(block, index, kind)).join("");
      fullJsonWrap.classList.add("hidden");
      formFields.classList.remove("hidden");
      formFields.querySelectorAll("[data-was-required]").forEach((field) => {
        field.required = true;
      });
      reindex();
      refreshPreview();
    }
  };

  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  });

  document.querySelector("#copy-furigana-rules")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(FURIGANA_RULES);
    toast("Reglas de furigana copiadas", "ok");
  });

  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      blocksRoot.insertAdjacentHTML("beforeend", blockEditor(emptyBlock(button.dataset.add), 0, kind));
      reindex();
      refreshPreview();
    });
  });

  const applyTimeShift = (sign) => {
    const input = document.querySelector("#time-shift");
    const seconds = Number(input?.value);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      toast("Indica los segundos a desplazar", "error");
      return;
    }
    const changed = shiftBlockTimes(form, sign * seconds);
    if (!changed) {
      toast("No hay timestamps que desplazar", "error");
      return;
    }
    refreshPreview();
    const label = sign < 0 ? `−${seconds}` : `+${seconds}`;
    toast(`${changed} tiempos ${label}s. Pulsa Guardar para conservar`, "ok");
  };

  document.querySelector("#time-shift-plus")?.addEventListener("click", () => {
    applyTimeShift(1);
  });
  document.querySelector("#time-shift-minus")?.addEventListener("click", () => {
    applyTimeShift(-1);
  });

  document.querySelector("#resync-times")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Buscando LRCLib…";
    try {
      const restored = await api(`/api/admin/lyrics/${id}/resync-timestamps`, {
        method: "POST",
        body: JSON.stringify({})
      });
      toast(`${restored.applied} timestamps restaurados`, "ok");
      await route();
    } catch (error) {
      toast(error.message, "error");
      button.disabled = false;
      button.textContent = "Recuperar timestamps";
    }
  });

  blocksRoot.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const block = target.closest(".block");
    if (!block) return;

    if (target.dataset.wrap) {
      const textarea = block.querySelector("textarea");
      if (textarea) wrapFurigana(textarea);
    }
    if (target.dataset.remove) block.remove();
    if (target.dataset.up) block.previousElementSibling?.before(block);
    if (target.dataset.down) block.nextElementSibling?.after(block);
    if (target.dataset.upload) {
      try {
        const url = await uploadFile();
        if (url) {
          const field = block.querySelector('[data-field="url"]');
          field.value = url;
        }
      } catch (error) {
        toast(error.message, "error");
      }
    }
    reindex();
    refreshPreview();
  });

  document.querySelector("#upload-cover")?.addEventListener("click", async () => {
    try {
      const url = await uploadFile();
      if (url) {
        form.elements.coverUrl.value = url;
        refreshPreview();
      }
    } catch (error) {
      toast(error.message, "error");
    }
  });

  document.querySelector("#add-topic")?.addEventListener("click", async () => {
    const topic = await openTopicModal();
    if (!topic) return;
    const select = form.elements.topic;
    select.querySelectorAll('option[value=""]').forEach((opt) => opt.remove());
    const option = document.createElement("option");
    option.value = topic.slug;
    option.textContent = topic.label;
    option.selected = true;
    select.append(option);
    toast("Tema creado", "ok");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    let data, blocks;
    try {
      ({ data, blocks } = collectForm(form, { strict: true }));
    } catch (error) {
      toast(error.message, "error");
      return;
    }
    const payload = {
      title: data.title,
      translation: data.translation || null,
      coverUrl: data.coverUrl || null,
      blocks: blocks.filter((block) =>
        block.type === "image" ? Boolean(block.url) : Boolean(block.content)
      )
    };
    if (kind === "stories") {
      payload.level = data.level;
    } else if (kind === "lyrics") {
      payload.artist = data.artist;
      payload.level = data.level || null;
      payload.youtubeUrl = data.youtubeUrl || null;
    } else {
      payload.topic = data.topic;
      payload.level = data.level || null;
    }

    try {
      if (isNew) {
        const created = await api(`/api/admin/${kind}`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
        toast("Creado", "ok");
        go(`/${kind}/${created.id}`);
      } else {
        await api(`/api/admin/${kind}/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        toast("Guardado", "ok");
      }
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

function reindex() {
  document.querySelectorAll("#blocks .block").forEach((node, index) => {
    node.dataset.index = String(index);
  });
}

const FURIGANA_RULES = `Reglas de furigana para el campo "content":

Sintaxis: [Texto](furigana:lectura.por.kanji)

- Envuelve la palabra completa entre corchetes, nunca un kanji suelto.
  Bien: [飛行機](furigana:ひ.こう.き)
  Mal:  [飛](furigana:ひ)行機
- La lectura va separada por puntos (.), una parte por cada kanji del
  texto, en el mismo orden: [家族](furigana:か.ぞく) → 家=か, 族=ぞく
- Okurigana (hiragana sin furigana) se marca como su propio tramo:
  [食べる](furigana:た.べる) → 食=た, べる=texto plano
- Si el número de partes no coincide con el número de kanji (jukujikun,
  lecturas irregulares), usa una sola lectura para toda la palabra:
  [今日](furigana:きょう)
- Solo los kanji reciben furigana; kana y puntuación quedan fuera de
  los corchetes.
- Usa la lectura real de esa palabra en ese contexto (on'yomi/kun'yomi
  según corresponda), no inventes lecturas.`;

function renderEditor(kind, item, topics = []) {
  const isStory = kind === "stories";
  const isLyric = kind === "lyrics";
  const isConversation = kind === "conversations";
  const isNew = !item;
  const newTitle = isStory ? "Nueva historia" : isLyric ? "Nueva letra" : "Nueva conversación";
  const title = isNew ? newTitle : item.title;
  const blocks = item?.blocks ?? [
    isConversation ? { type: "dialogue", speaker: "", content: "", translation: "" } : { type: "text", content: "", translation: "" }
  ];
  const hasRegisteredTopic = item?.topic && topics.some((t) => t.slug === item.topic);
  const topicOptions = [
    `<option value="" ${item?.topic ? "" : "selected"} disabled>Elige un tema…</option>`,
    ...topics.map(
      (t) =>
        `<option value="${escapeHtml(t.slug)}" ${item?.topic === t.slug ? "selected" : ""}>${escapeHtml(t.label)}</option>`
    ),
    item?.topic && !hasRegisteredTopic
      ? `<option value="${escapeHtml(item.topic)}" selected>${escapeHtml(item.topic)} (sin registrar)</option>`
      : ""
  ].join("");

  app.innerHTML = layout(
    kind,
    `
      <form id="editor-form" class="editor-grid">
        <section class="editor pad">
          <div class="row">
            <div>
              <div class="kicker">${isNew ? "Crear" : "Editar"}</div>
              <h1>${escapeHtml(title)}</h1>
            </div>
            <div class="view-toggle" role="tablist">
              <button class="tiny view-tab active" data-view="form" type="button">Formulario</button>
              <button class="tiny view-tab" data-view="json" type="button">JSON</button>
            </div>
            <a class="ghost" href="#/${kind}">Volver</a>
          </div>
          <div id="form-fields">
          <div class="meta-grid">
            <label class="field">
              <span>Título</span>
              <input
                name="title"
                class="jp"
                lang="ja"
                spellcheck="false"
                autocomplete="off"
                autocapitalize="off"
                placeholder="本文"
                required
                value="${escapeHtml(item?.title)}"
              />
            </label>
            <label class="field">
              <span>${isStory ? "Nivel" : isLyric ? "Artista" : "Tema"}</span>
              ${
                isStory
                  ? `<select name="level">
                      ${["N5", "N4", "N3", "N2", "N1"]
                        .map(
                          (level) =>
                            `<option ${item?.level === level ? "selected" : ""}>${level}</option>`
                        )
                        .join("")}
                    </select>`
                  : isLyric
                    ? `<input name="artist" class="jp" lang="ja" spellcheck="false" autocomplete="off" required value="${escapeHtml(item?.artist)}" />`
                    : `<div class="cover-row">
                        <select name="topic" required>${topicOptions}</select>
                        <button class="ghost" id="add-topic" type="button">+ Nuevo</button>
                      </div>`
              }
            </label>
          </div>
          <label class="field">
            <span>Traducción del título</span>
            <input name="translation" value="${escapeHtml(item?.translation)}" />
          </label>
          <label class="field">
            <span>Portada</span>
            <div class="cover-row">
              <input name="coverUrl" value="${escapeHtml(item?.coverUrl)}" placeholder="https://…" />
              <button class="ghost" id="upload-cover" type="button">Subir</button>
            </div>
          </label>
          ${
            isLyric
              ? `<label class="field">
            <span>YouTube</span>
            <input name="youtubeUrl" value="${escapeHtml(item?.youtubeUrl)}" placeholder="https://youtu.be/…" />
          </label>`
              : ""
          }
          ${
            isStory
              ? ""
              : `<label class="field">
            <span>Nivel JLPT (opcional)</span>
            <select name="level">
              <option value="" ${!item?.level ? "selected" : ""}>Sin clasificar</option>
              ${["N5", "N4", "N3", "N2", "N1"]
                .map(
                  (level) =>
                    `<option ${item?.level === level ? "selected" : ""}>${level}</option>`
                )
                .join("")}
            </select>
          </label>`
          }
          ${
            isLyric
              ? `<div class="time-shift">
            <label class="field">
              <span>Desplazar todos los timestamps</span>
              <div class="cover-row">
                <input id="time-shift" type="number" min="0" step="0.01" value="0.5" />
                <button class="ghost" id="time-shift-minus" type="button">− Restar</button>
                <button class="ghost" id="time-shift-plus" type="button">+ Sumar</button>
              </div>
            </label>
            <p class="muted">Suma o resta esos segundos a todas las líneas. Luego guarda.</p>
          </div>`
              : ""
          }
          <div class="row">
            <h2>Bloques</h2>
          </div>
          <div id="add-row" class="add-row">
            <button class="ghost" data-add="text" type="button">+ Texto</button>
            <button class="ghost" data-add="header" type="button">+ Encabezado</button>
            <button class="ghost" data-add="image" type="button">+ Imagen</button>
            ${
              isConversation
                ? `<button class="ghost" data-add="dialogue" type="button">+ Diálogo</button>`
                : ""
            }
          </div>
          <div id="blocks">${blocks.map((block, index) => blockEditor(block, index, kind)).join("")}</div>
          </div>
          <div id="full-json-wrap" class="hidden">
            <textarea id="full-json" class="blocks-json" spellcheck="false"></textarea>
            <p class="muted">Copia este JSON completo (título, metadatos y bloques), edítalo con otro agente y pégalo aquí. Cambia a "Formulario" para verlo aplicado, o guarda directamente desde esta vista.</p>
            <button class="ghost" id="copy-furigana-rules" type="button">Copiar reglas de furigana</button>
          </div>
          <div class="actions">
            <button class="primary" type="submit">Guardar</button>
            ${
              isLyric && !isNew
                ? `<button class="ghost" id="resync-times" type="button">Recuperar timestamps</button>`
                : ""
            }
          </div>
        </section>
        <aside class="preview-card">
          <div class="kicker">Preview</div>
          <div id="preview"></div>
          <p class="muted">Sintaxis: [家族](furigana:か.ぞく). Selecciona texto y pulsa Furigana.</p>
        </aside>
      </form>
    `
  );
  bindLogout();
  bindEditor(kind, isNew, item?.id);
}

const IMPORT_EXAMPLE = `{
  "stories": [
    {
      "title": "本文",
      "level": "N3",
      "translation": "Texto Principal",
      "blocks": [
        {
          "type": "text",
          "content": "[家族](furigana:か.ぞく)で[正月](furigana:しょう.がつ)を[すごす](furigana:すごす)。",
          "translation": "Pasamos el Año Nuevo en familia."
        }
      ]
    }
  ],
  "lyrics": [
    {
      "title": "Brave Heart",
      "artist": "Ayumi Miyazaki",
      "translation": "Corazón Valiente",
      "blocks": [
        {
          "type": "header",
          "content": "Verso 1"
        },
        {
          "type": "text",
          "content": "[逃げ出さ](furigana:に.げ.だ.さ)ないことは [解](furigana:わか)っている",
          "translation": "Sé que no voy a huir"
        }
      ]
    }
  ],
  "conversations": [
    {
      "title": "コンビニで",
      "topic": "convenience_store",
      "translation": "En la tienda de conveniencia",
      "blocks": [
        {
          "type": "dialogue",
          "speaker": "Empleado",
          "content": "[いらっしゃいませ](furigana:いらっしゃいませ)",
          "translation": "¡Bienvenido!"
        },
        {
          "type": "dialogue",
          "speaker": "Cliente",
          "content": "[袋](furigana:ふくろ)は[いりません](furigana:いりません)",
          "translation": "No necesito bolsa"
        }
      ]
    }
  ]
}`;

const AGENT_PROMPT = `Genera JSON para KanjiBE. Responde SOLO con un objeto JSON válido, sin markdown.

Forma:
{
  "stories": [{ "title", "level", "translation", "coverUrl", "blocks" }],
  "lyrics": [{ "title", "artist", "translation", "coverUrl", "blocks" }],
  "conversations": [{ "title", "topic", "level", "translation", "coverUrl", "blocks" }]
}

blocks (stories/lyrics): array de { "type": "text"|"header"|"image", "content"?, "translation"?, "url"?, "caption"? }
blocks (conversations): array de { "type": "dialogue"|"text"|"header"|"image", "speaker"? (obligatorio si type=dialogue), "content"?, "translation"?, "url"?, "caption"? }
- Palabra completa: [掴め](furigana:つか.め) [飛行機](furigana:ひ.こう.き) [知らない](furigana:し.ら.な.い)
- NO kanji suelto: [掴](furigana:つか)め
- image: url absoluta
level: N5|N4|N3|N2|N1 (opcional en lyrics/conversations, obligatorio en stories)
topic: slug corto en snake_case, ej. convenience_store, immigration_interview
No inventes ids. coverUrl puede ser null.`;

function renderImport() {
  app.innerHTML = layout(
    "import",
    `
      <div class="row">
        <div>
          <div class="kicker">Lote</div>
          <h1>Importar JSON</h1>
          <p class="muted">Pega el JSON de otro agente o sube un .json. Si el objeto trae id y ya existe, se actualiza.</p>
        </div>
      </div>
      <section class="editor pad import-panel">
        <div class="kicker">Gemini</div>
        <h2>Tokenizar texto crudo</h2>
        <p class="muted">Pega el cuento, la letra o el diálogo en japonés. Gemini lo convierte al JSON de KanjiBE y lo deja abajo para que lo revises e importes.</p>
        <div class="meta-grid">
          <label class="field">
            <span>Tipo</span>
            <select id="tokenize-kind">
              <option value="auto">Auto</option>
              <option value="story">Cuento</option>
              <option value="lyric">Canción</option>
              <option value="conversation">Conversación</option>
            </select>
          </label>
          <label class="field">
            <span>Modelo Gemini</span>
            <select id="tokenize-model">
              <option value="gemini-3.5-flash">gemini-3.5-flash</option>
              <option value="gemini-3.6-flash">gemini-3.6-flash</option>
              <option value="gemini-2.5-flash">gemini-2.5-flash</option>
            </select>
          </label>
        </div>
        <label class="field">
          <span>Texto japonés</span>
          <textarea id="raw-jp" class="jp import-json" lang="ja" spellcheck="false" placeholder="飛翔たいたら…"></textarea>
        </label>
        <div class="actions">
          <button class="primary" id="run-tokenize" type="button">Tokenizar con Gemini</button>
        </div>
      </section>
      <section class="editor pad import-panel import-panel-json">
        <div class="add-row">
          <button class="ghost" id="load-example" type="button">Cargar ejemplo</button>
          <button class="ghost" id="copy-prompt" type="button">Copiar prompt del agente</button>
          <label class="ghost file-label">
            Subir archivo
            <input id="import-file" class="hidden-file" type="file" accept="application/json,.json" />
          </label>
        </div>
        <label class="field">
          <span>JSON</span>
          <textarea id="import-json" class="import-json" spellcheck="false" placeholder='{ "stories": [], "lyrics": [], "conversations": [] }'></textarea>
        </label>
        <div class="actions">
          <button class="primary" id="run-import" type="button">Importar</button>
        </div>
        <pre id="import-result" class="import-result" hidden></pre>
      </section>
    `
  );
  bindLogout();
  document.querySelectorAll(".import-panel").forEach((panel) => enablePlainPaste(panel));

  const textarea = document.querySelector("#import-json");
  bindGeminiModelSelect();

  document.querySelector("#run-tokenize").addEventListener("click", async () => {
    const text = document.querySelector("#raw-jp").value.trim();
    if (!text) {
      toast("Pega el texto japonés", "error");
      return;
    }
    const button = document.querySelector("#run-tokenize");
    button.disabled = true;
    button.textContent = "Tokenizando…";
    try {
      const kind = document.querySelector("#tokenize-kind").value;
      const model =
        document.querySelector("#tokenize-model")?.value || "gemini-3.5-flash";
      localStorage.setItem("kanjibe.geminiModel", model);
      const data = await api("/api/admin/tokenize", {
        method: "POST",
        body: JSON.stringify({ text, kind, model })
      });
      textarea.value = JSON.stringify(data, null, 2);
      toast("JSON listo. Revísalo e importa.", "ok");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Tokenizar con Gemini";
    }
  });
  document.querySelector("#load-example").addEventListener("click", () => {
    textarea.value = IMPORT_EXAMPLE;
  });
  document.querySelector("#copy-prompt").addEventListener("click", async () => {
    await navigator.clipboard.writeText(AGENT_PROMPT);
    toast("Prompt copiado", "ok");
  });
  document.querySelector("#import-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    textarea.value = await file.text();
  });
  document.querySelector("#run-import").addEventListener("click", async () => {
    const resultEl = document.querySelector("#import-result");
    let payload;
    try {
      payload = JSON.parse(textarea.value);
    } catch {
      toast("JSON inválido", "error");
      return;
    }
    try {
      const result = await api("/api/admin/import", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const created =
        result.created.stories.length +
        result.created.lyrics.length +
        (result.created.conversations?.length ?? 0);
      const updated =
        result.updated.stories.length +
        result.updated.lyrics.length +
        (result.updated.conversations?.length ?? 0);
      toast(`Creados ${created}, actualizados ${updated}`, result.errors.length ? "error" : "ok");
      resultEl.hidden = false;
      resultEl.textContent = JSON.stringify(result, null, 2);
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

function renderMangaList(items) {
  const cards = items.length
    ? items
        .map(
          (item) => `
        <article class="card item">
          ${coverMarkup(item.cover_url)}
          <div class="item-body">
            <div class="kicker">${item.page_count} página${item.page_count === 1 ? "" : "s"}</div>
            <h2>${escapeHtml(item.title)}${item.volume_number ? ` · Vol. ${escapeHtml(item.volume_number)}` : ""}</h2>
            <p class="muted">Actualizado ${new Date(item.updated_at).toLocaleString()}</p>
            <div class="actions">
              <a class="primary" href="#/manga/${encodeURIComponent(item.id)}">Ver páginas</a>
            </div>
          </div>
        </article>`
        )
        .join("")
    : `<div class="empty"><h2>No hay tomos todavía</h2><p class="muted">Se cargan desde el cliente desktop OCR vía <code>POST /api/admin/manga/ingest</code>. Ver <code>docs/manga-ingest.md</code>.</p></div>`;

  app.innerHTML = layout(
    "manga",
    `
      <div class="row">
        <div>
          <div class="kicker">Contenido</div>
          <h1>Manga</h1>
        </div>
      </div>
      <div class="grid">${cards}</div>
    `
  );
  bindLogout();
}

function mangaPageThumb(volume, page) {
  const count = page.dialogues.length;
  return `
    <article class="card item">
      <a href="#/manga/${encodeURIComponent(volume.id)}/pages/${page.page_index}">
        <img class="cover" src="${escapeHtml(page.image_url)}" alt="Página ${page.page_index}" loading="lazy" />
      </a>
      <div class="item-body">
        <div class="kicker">Página ${page.page_index}</div>
        <p class="muted">${count} diálogo${count === 1 ? "" : "s"}</p>
        <div class="actions">
          <a class="ghost tiny" href="#/manga/${encodeURIComponent(volume.id)}/pages/${page.page_index}">Editar</a>
          <button class="danger tiny" data-del-page="${page.page_index}" type="button">Borrar</button>
        </div>
      </div>
    </article>`;
}

function renderMangaVolume(volume) {
  const pages = [...volume.pages].sort((a, b) => a.page_index - b.page_index);
  const cards = pages.length
    ? pages.map((page) => mangaPageThumb(volume, page)).join("")
    : `<div class="empty"><h2>Este tomo no tiene páginas</h2></div>`;

  app.innerHTML = layout(
    "manga",
    `
      <div class="row">
        <div>
          <div class="kicker"><a href="#/manga">Manga</a></div>
          <h1>${escapeHtml(volume.title)}${volume.volume_number ? ` · Vol. ${escapeHtml(volume.volume_number)}` : ""}</h1>
          <p class="muted">${pages.length} página${pages.length === 1 ? "" : "s"}</p>
        </div>
      </div>
      <div class="grid">${cards}</div>
    `
  );
  bindLogout();

  app.querySelectorAll("[data-del-page]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("¿Borrar esta página y sus diálogos?")) return;
      try {
        await api(
          `/api/admin/manga/${encodeURIComponent(volume.id)}/pages/${button.dataset.delPage}`,
          { method: "DELETE" }
        );
        toast("Página borrada", "ok");
        await route();
      } catch (error) {
        toast(error.message, "error");
      }
    });
  });
}

function mangaDialogueCard(dialogue, index) {
  const tokensValue = dialogue.tokens.join(", ");
  const morphologyValue = dialogue.morphology.map((item) => `${item.surface} = ${item.pos}`).join("\n");
  return `
    <form class="block manga-dialogue" data-dialogue-index="${index}">
      <div class="block-head">
        <b>Diálogo ${index + 1}</b>
      </div>
      <label class="field">
        <span>Texto (OCR)</span>
        <textarea class="jp" data-field="full_text" rows="2">${escapeHtml(dialogue.full_text)}</textarea>
      </label>
      <label class="field">
        <span>Furigana</span>
        <textarea class="jp" data-field="furigana" rows="2">${escapeHtml(dialogue.furigana)}</textarea>
      </label>
      <div class="manga-furigana-preview" data-preview></div>
      <label class="field">
        <span>Tokens (separados por coma)</span>
        <input data-field="tokens" value="${escapeHtml(tokensValue)}" />
      </label>
      <label class="field">
        <span>Morfología (una por línea: superficie = categoría)</span>
        <textarea data-field="morphology" rows="3">${escapeHtml(morphologyValue)}</textarea>
      </label>
      <div class="meta-grid manga-box-fields">
        <label class="field"><span>x</span><input type="number" data-field="x" value="${dialogue.dialogue_box.x}" /></label>
        <label class="field"><span>y</span><input type="number" data-field="y" value="${dialogue.dialogue_box.y}" /></label>
        <label class="field"><span>ancho</span><input type="number" data-field="width" value="${dialogue.dialogue_box.width}" /></label>
        <label class="field"><span>alto</span><input type="number" data-field="height" value="${dialogue.dialogue_box.height}" /></label>
      </div>
      <div class="actions">
        <button class="primary" type="submit">Guardar</button>
      </div>
    </form>`;
}

function renderMangaPageEditor(volume, page, pageIndex) {
  const pages = [...volume.pages].sort((a, b) => a.page_index - b.page_index);
  const currentPos = pages.findIndex((item) => item.page_index === pageIndex);
  const prevPage = currentPos > 0 ? pages[currentPos - 1] : null;
  const nextPage = currentPos >= 0 && currentPos < pages.length - 1 ? pages[currentPos + 1] : null;
  const dialogues = [...page.dialogues].sort((a, b) => a.dialogue_index - b.dialogue_index);

  // Positioned via SVG geometry attributes (x/y/width/height on <rect>/<text>),
  // not CSS — the app's CSP (style-src 'self', no unsafe-inline) silently
  // drops inline "style" attributes and JS .style.* writes, which would make
  // percentage-positioned <div> overlays invisible/misplaced.
  const boxes = dialogues
    .map((dialogue, index) => {
      const box = dialogue.dialogue_box;
      return `
        <rect class="manga-box" data-dialogue-index="${index}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"></rect>
        <text class="manga-box-num" data-dialogue-index="${index}" x="${box.x}" y="${Math.max(0, box.y - 6)}">${index + 1}</text>`;
    })
    .join("");

  const dialogueCards = dialogues.length
    ? dialogues.map((dialogue, index) => mangaDialogueCard(dialogue, index)).join("")
    : `<p class="muted">Esta página no tiene diálogos.</p>`;

  app.innerHTML = layout(
    "manga",
    `
      <div class="row">
        <div>
          <div class="kicker"><a href="#/manga">Manga</a> · <a href="#/manga/${encodeURIComponent(volume.id)}">${escapeHtml(volume.title)}</a></div>
          <h1>Página ${pageIndex}</h1>
        </div>
        <div class="actions">
          ${prevPage ? `<a class="ghost" href="#/manga/${encodeURIComponent(volume.id)}/pages/${prevPage.page_index}">← Anterior</a>` : ""}
          ${nextPage ? `<a class="ghost" href="#/manga/${encodeURIComponent(volume.id)}/pages/${nextPage.page_index}">Siguiente →</a>` : ""}
        </div>
      </div>
      <div class="editor-grid">
        <section class="editor pad">
          <div class="manga-image-wrap" id="manga-image-wrap">
            <img id="manga-page-image" src="${escapeHtml(page.image_url)}" alt="" />
            <svg id="manga-box-layer" class="manga-box-layer" viewBox="0 0 ${page.width} ${page.height}" preserveAspectRatio="none">
              ${boxes}
            </svg>
          </div>
          <div class="upload-row manga-upload-row">
            <label class="ghost file-label">
              Reemplazar imagen…
              <input id="manga-replace-image" class="hidden-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" />
            </label>
            <button class="danger" id="manga-delete-page" type="button">Borrar página</button>
          </div>
        </section>
        <aside class="manga-dialogues">${dialogueCards}</aside>
      </div>
    `
  );
  bindLogout();
  bindMangaPageEditor(volume, page, pageIndex);
}

function parseTokensInput(value) {
  return value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseMorphologyInput(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [surface, pos] = line.split("=").map((part) => part.trim());
      return { surface: surface ?? "", pos: pos ?? "" };
    })
    .filter((item) => item.surface);
}

function bindMangaPageEditor(volume, page, pageIndex) {
  const wrap = document.querySelector("#manga-image-wrap");
  const svg = document.querySelector("#manga-box-layer");
  const forms = [...document.querySelectorAll(".manga-dialogue")];

  forms.forEach((form) => {
    const preview = form.querySelector("[data-preview]");
    const furiganaField = form.querySelector('[data-field="furigana"]');
    const updatePreview = () => {
      preview.replaceChildren(renderFurigana(furiganaField.value));
    };
    updatePreview();
    furiganaField.addEventListener("input", updatePreview);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const index = Number(form.dataset.dialogueIndex);
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      const body = {
        full_text: form.querySelector('[data-field="full_text"]').value.trim(),
        furigana: furiganaField.value,
        tokens: parseTokensInput(form.querySelector('[data-field="tokens"]').value),
        morphology: parseMorphologyInput(form.querySelector('[data-field="morphology"]').value),
        dialogue_box: {
          x: Number(form.querySelector('[data-field="x"]').value),
          y: Number(form.querySelector('[data-field="y"]').value),
          width: Number(form.querySelector('[data-field="width"]').value),
          height: Number(form.querySelector('[data-field="height"]').value)
        }
      };
      try {
        await api(
          `/api/admin/manga/${encodeURIComponent(volume.id)}/pages/${pageIndex}/dialogues/${index}`,
          { method: "PATCH", body: JSON.stringify(body) }
        );
        toast("Diálogo guardado", "ok");
        await route();
      } catch (error) {
        toast(error.message, "error");
        button.disabled = false;
      }
    });
  });

  svg.querySelectorAll(".manga-box").forEach((box) => {
    const index = Number(box.dataset.dialogueIndex);
    const label = svg.querySelector(`.manga-box-num[data-dialogue-index="${index}"]`);

    box.addEventListener("click", () => {
      if (box.dataset.dragged === "1") {
        box.dataset.dragged = "0";
        return;
      }
      svg.querySelectorAll(".manga-box").forEach((item) => item.classList.remove("selected"));
      box.classList.add("selected");
      const target = forms[index];
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.classList.add("flash");
      window.setTimeout(() => target?.classList.remove("flash"), 900);
    });

    box.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      box.setPointerCapture(event.pointerId);
      const form = forms[index];
      const xField = form.querySelector('[data-field="x"]');
      const yField = form.querySelector('[data-field="y"]');
      const startX = event.clientX;
      const startY = event.clientY;
      const originX = Number(xField.value);
      const originY = Number(yField.value);
      const svgRect = svg.getBoundingClientRect();
      const scaleX = page.width / svgRect.width;
      const scaleY = page.height / svgRect.height;

      const onMove = (moveEvent) => {
        box.dataset.dragged = "1";
        const dx = (moveEvent.clientX - startX) * scaleX;
        const dy = (moveEvent.clientY - startY) * scaleY;
        const nextX = Math.max(0, Math.round(originX + dx));
        const nextY = Math.max(0, Math.round(originY + dy));
        xField.value = String(nextX);
        yField.value = String(nextY);
        box.setAttribute("x", String(nextX));
        box.setAttribute("y", String(nextY));
        label?.setAttribute("x", String(nextX));
        label?.setAttribute("y", String(Math.max(0, nextY - 6)));
      };
      const onUp = () => {
        box.removeEventListener("pointermove", onMove);
        box.removeEventListener("pointerup", onUp);
      };
      box.addEventListener("pointermove", onMove);
      box.addEventListener("pointerup", onUp);
    });
  });

  document.querySelector("#manga-replace-image")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append("image", file);
    try {
      await api(`/api/admin/manga/${encodeURIComponent(volume.id)}/pages/${pageIndex}/image`, {
        method: "PUT",
        body
      });
      toast("Imagen reemplazada", "ok");
      await route();
    } catch (error) {
      toast(error.message, "error");
    }
  });

  document.querySelector("#manga-delete-page")?.addEventListener("click", async () => {
    if (!confirm("¿Borrar esta página y sus diálogos?")) return;
    try {
      await api(`/api/admin/manga/${encodeURIComponent(volume.id)}/pages/${pageIndex}`, {
        method: "DELETE"
      });
      toast("Página borrada", "ok");
      go(`/manga/${volume.id}`);
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

async function route() {
  const { section, id, rest } = parseRoute();
  if (section === "login") {
    renderLogin();
    return;
  }
  if (!(await requireSession())) return;

  try {
    if (section === "manga" && !id) {
      const list = await api("/api/admin/manga?limit=100");
      renderMangaList(list.data);
      return;
    }
    if (section === "manga" && id && rest[0] === "pages" && rest[1] !== undefined) {
      const pageIndex = Number(rest[1]);
      const [volume, page] = await Promise.all([
        api(`/api/admin/manga/${encodeURIComponent(id)}`),
        api(`/api/admin/manga/${encodeURIComponent(id)}/pages/${pageIndex}`)
      ]);
      renderMangaPageEditor(volume, page, pageIndex);
      return;
    }
    if (section === "manga" && id) {
      const volume = await api(`/api/admin/manga/${encodeURIComponent(id)}`);
      renderMangaVolume(volume);
      return;
    }
    if (section === "stories" && !id) {
      const list = await api("/api/stories?limit=100");
      renderList("stories", list.data);
      return;
    }
    if (section === "lyrics" && !id) {
      const list = await api("/api/lyrics?limit=100");
      renderList("lyrics", list.data);
      return;
    }
    if (section === "conversations" && !id) {
      const [list, topics] = await Promise.all([
        api("/api/conversations?limit=100"),
        api("/api/topics")
      ]);
      renderList("conversations", list.data, { topics: topics.data });
      return;
    }
    if (section === "search") {
      app.innerHTML = layout(
        "search",
        `
        <div class="row">
          <div>
            <div class="kicker">LRCLib</div>
            <h1>Buscar canción</h1>
            <p class="muted">Revisa la letra y el idioma antes de guardar. Gemini usa el modelo global del panel (3.5 Flash por defecto).</p>
          </div>
        </div>
        <section class="editor pad search-panel">
          <label class="field">
            <span>Modelo Gemini</span>
            <select id="tokenize-model">
              <option value="gemini-3.5-flash">gemini-3.5-flash</option>
              <option value="gemini-3.6-flash">gemini-3.6-flash</option>
              <option value="gemini-2.5-flash">gemini-2.5-flash</option>
            </select>
          </label>
          <label class="field">
            <span>Artista o título</span>
            <div class="cover-row">
              <input id="lrclib-q" placeholder="Blue Bird Ikimonogakari" />
              <button class="primary" id="lrclib-search" type="button">Buscar</button>
            </div>
          </label>
          <div id="lrclib-results"></div>
        </section>
      `
      );
      bindLogout();
      bindGeminiModelSelect();
      bindLrcLibSearch();
      return;
    }
    if (section === "import") {
      renderImport();
      return;
    }
    if (section === "stories" || section === "lyrics" || section === "conversations") {
      const [item, topics] = await Promise.all([
        id === "new" ? Promise.resolve(null) : api(`/api/${section}/${id}`),
        section === "conversations" ? api("/api/topics") : Promise.resolve(null)
      ]);
      renderEditor(section, item, topics?.data ?? []);
      return;
    }
    go("/stories");
  } catch (error) {
    toast(error.message, "error");
    app.innerHTML = layout(section, `<div class="empty"><h2>${error.message}</h2></div>`);
    bindLogout();
  }
}

window.addEventListener("hashchange", () => {
  void route();
});

void route();
