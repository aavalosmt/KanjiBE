const KEY = "kanjibe.adminKey";
const app = document.querySelector("#app");
const toastEl = document.querySelector("#toast");

function getKey() {
  return sessionStorage.getItem(KEY) ?? "";
}

function setKey(value) {
  sessionStorage.setItem(KEY, value);
}

function clearKey() {
  sessionStorage.removeItem(KEY);
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
    id: parts[1] ? decodeURIComponent(parts[1]) : undefined
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

function renderList(kind, items) {
  const isStory = kind === "stories";
  const cards = items.length
    ? items
        .map(
          (item) => `
        <article class="card item">
          ${coverMarkup(item.coverUrl)}
          <div class="item-body">
            <div class="kicker">${escapeHtml(isStory ? item.level : item.artist)}</div>
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
    : `<div class="empty"><h2>No hay ${isStory ? "historias" : "letras"} todavía</h2><p class="muted">Crea la primera desde este panel.</p></div>`;

  app.innerHTML = layout(
    kind,
    `
      <div class="row">
        <div>
          <div class="kicker">Contenido</div>
          <h1>${isStory ? "Historias" : "Letras"}</h1>
        </div>
        <div class="actions">
          <a class="ghost" href="#/import">Importar JSON</a>
          <a class="primary" href="#/${kind}/new">Nueva ${isStory ? "historia" : "letra"}</a>
        </div>
      </div>
      ${
        isStory
          ? ""
          : `<section class="editor pad search-panel">
        <label class="field">
          <span>Buscar en LRCLib</span>
          <div class="cover-row">
            <input id="lrclib-q" placeholder="Blue Bird Ikimonogakari" />
            <button class="primary" id="lrclib-search" type="button">Buscar</button>
          </div>
        </label>
        <div id="lrclib-results"></div>
      </section>`
      }
      <section class="grid">${cards}</section>
    `
  );
  bindLogout();
  if (!isStory) bindLrcLibSearch();

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
      </article>
    `;
  }

  return `
    <article class="block" data-index="${index}">
      ${common}
      <label class="field">
        <span>Contenido</span>
        <textarea data-field="content" class="jp" lang="ja" spellcheck="false" autocomplete="off">${escapeHtml(block.content)}</textarea>
      </label>
      <label class="field">
        <span>Traducción</span>
        <input data-field="translation" value="${escapeHtml(block.translation)}" />
      </label>
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
      translation: block.translation ?? null
    };
  }
  const view = {
    ...(block.id ? { id: block.id } : {}),
    type: block.type,
    content: block.content || "",
    translation: block.translation ?? null
  };
  if (kind === "lyrics") view.startTime = block.startTime ?? null;
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
    type: block.type === "image" || block.type === "header" ? block.type : "text",
    ...(block.id ? { id: block.id } : {}),
    ...(block.content ? { content: block.content } : {}),
    ...(block.translation ? { translation: block.translation } : {}),
    ...(block.url ? { url: block.url } : {}),
    ...(block.caption ? { caption: block.caption } : {}),
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
  kicker.textContent = kind === "stories" ? data.level || "Nivel" : data.artist || "Artista";
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
      pane.append(renderFurigana(block.content ?? ""));
    }
    if (block.translation) {
      const tr = document.createElement("p");
      tr.className = "preview-tr";
      tr.textContent = block.translation;
      pane.append(tr);
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
      if (kind !== "stories") {
        obj.artist = data.artist || "";
        obj.youtubeUrl = data.youtubeUrl || null;
      }
      obj.blocks = blocks.map((block) => blockForJsonView(block, kind));
      fullJsonField.value = JSON.stringify(obj, null, 2);
      formFields.classList.add("hidden");
      fullJsonWrap.classList.remove("hidden");
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
      } else {
        form.elements.level.value = parsed.level || "";
        form.elements.artist.value = parsed.artist || "";
        form.elements.youtubeUrl.value = parsed.youtubeUrl || "";
      }
      blocksRoot.innerHTML = parsed.blocks.map((block, index) => blockEditor(block, index, kind)).join("");
      fullJsonWrap.classList.add("hidden");
      formFields.classList.remove("hidden");
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
    if (kind === "stories") payload.level = data.level;
    else {
      payload.artist = data.artist;
      payload.level = data.level || null;
      payload.youtubeUrl = data.youtubeUrl || null;
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

function renderEditor(kind, item) {
  const isStory = kind === "stories";
  const isNew = !item;
  const title = isNew ? (isStory ? "Nueva historia" : "Nueva letra") : item.title;
  const blocks = item?.blocks ?? [{ type: "text", content: "", translation: "" }];

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
              <span>${isStory ? "Nivel" : "Artista"}</span>
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
                  : `<input name="artist" class="jp" lang="ja" spellcheck="false" autocomplete="off" required value="${escapeHtml(item?.artist)}" />`
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
            isStory
              ? ""
              : `<label class="field">
            <span>YouTube</span>
            <input name="youtubeUrl" value="${escapeHtml(item?.youtubeUrl)}" placeholder="https://youtu.be/…" />
          </label>`
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
            isStory
              ? ""
              : `<div class="time-shift">
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
          }
          <div class="row">
            <h2>Bloques</h2>
          </div>
          <div id="add-row" class="add-row">
            <button class="ghost" data-add="text" type="button">+ Texto</button>
            <button class="ghost" data-add="header" type="button">+ Encabezado</button>
            <button class="ghost" data-add="image" type="button">+ Imagen</button>
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
              !isStory && !isNew
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
  ]
}`;

const AGENT_PROMPT = `Genera JSON para KanjiBE. Responde SOLO con un objeto JSON válido, sin markdown.

Forma:
{
  "stories": [{ "title", "level", "translation", "coverUrl", "blocks" }],
  "lyrics": [{ "title", "artist", "translation", "coverUrl", "blocks" }]
}

blocks: array de { "type": "text"|"header"|"image", "content"?, "translation"?, "url"?, "caption"? }
- Palabra completa: [掴め](furigana:つか.め) [飛行機](furigana:ひ.こう.き) [知らない](furigana:し.ら.な.い)
- NO kanji suelto: [掴](furigana:つか)め
- image: url absoluta
level: N5|N4|N3|N2|N1
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
        <p class="muted">Pega el cuento o la letra en japonés. Gemini lo convierte al JSON de KanjiBE y lo deja abajo para que lo revises e importes.</p>
        <div class="meta-grid">
          <label class="field">
            <span>Tipo</span>
            <select id="tokenize-kind">
              <option value="auto">Auto</option>
              <option value="story">Cuento</option>
              <option value="lyric">Canción</option>
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
          <textarea id="import-json" class="import-json" spellcheck="false" placeholder='{ "stories": [], "lyrics": [] }'></textarea>
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
        result.created.stories.length + result.created.lyrics.length;
      const updated =
        result.updated.stories.length + result.updated.lyrics.length;
      toast(`Creados ${created}, actualizados ${updated}`, result.errors.length ? "error" : "ok");
      resultEl.hidden = false;
      resultEl.textContent = JSON.stringify(result, null, 2);
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

async function route() {
  const { section, id } = parseRoute();
  if (section === "login") {
    renderLogin();
    return;
  }
  if (!(await requireSession())) return;

  try {
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
    if (section === "stories" || section === "lyrics") {
      const item = id === "new" ? null : await api(`/api/${section}/${id}`);
      renderEditor(section, item);
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
