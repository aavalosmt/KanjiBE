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
        <a class="primary" href="#/${kind}/new">Nueva ${isStory ? "historia" : "letra"}</a>
      </div>
      <section class="grid">${cards}</section>
    `
  );
  bindLogout();

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

function blockEditor(block, index) {
  const wrapButton =
    block.type === "image"
      ? ""
      : `<button class="tiny" data-wrap="${index}" type="button">Furigana</button>`;
  const common = `
    <div class="block-head">
      <b>${block.type}</b>
      <div class="block-tools">
        ${wrapButton}
        <button class="tiny" data-up="${index}" type="button">↑</button>
        <button class="tiny" data-down="${index}" type="button">↓</button>
        <button class="tiny danger" data-remove="${index}" type="button">Quitar</button>
      </div>
    </div>
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
        <textarea data-field="content">${escapeHtml(block.content)}</textarea>
      </label>
      <label class="field">
        <span>Traducción</span>
        <input data-field="translation" value="${escapeHtml(block.translation)}" />
      </label>
    </article>
  `;
}

function collectForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const blocks = [...form.querySelectorAll(".block")].map((node) => {
    const type = node.querySelector("b").textContent.trim();
    const block = { type };
    node.querySelectorAll("[data-field]").forEach((input) => {
      const value = input.value.trim();
      if (value) block[input.dataset.field] = value;
    });
    return block;
  });
  return { data, blocks };
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

  for (const block of blocks) {
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

function bindEditor(kind, isNew, id) {
  const form = document.querySelector("#editor-form");
  const blocksRoot = document.querySelector("#blocks");

  const refreshPreview = () => renderPreview(kind, form);
  form.addEventListener("input", refreshPreview);
  refreshPreview();

  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      blocksRoot.insertAdjacentHTML("beforeend", blockEditor(emptyBlock(button.dataset.add), 0));
      reindex();
      refreshPreview();
    });
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
    const { data, blocks } = collectForm(form);
    const payload = {
      title: data.title,
      translation: data.translation || null,
      coverUrl: data.coverUrl || null,
      blocks: blocks.filter((block) =>
        block.type === "image" ? Boolean(block.url) : Boolean(block.content)
      )
    };
    if (kind === "stories") payload.level = data.level;
    else payload.artist = data.artist;

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
            <a class="ghost" href="#/${kind}">Volver</a>
          </div>
          <div class="meta-grid">
            <label class="field">
              <span>Título</span>
              <input name="title" required value="${escapeHtml(item?.title)}" />
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
                  : `<input name="artist" required value="${escapeHtml(item?.artist)}" />`
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
          <div class="row">
            <h2>Bloques</h2>
          </div>
          <div class="add-row">
            <button class="ghost" data-add="text" type="button">+ Texto</button>
            <button class="ghost" data-add="header" type="button">+ Encabezado</button>
            <button class="ghost" data-add="image" type="button">+ Imagen</button>
          </div>
          <div id="blocks">${blocks.map((block, index) => blockEditor(block, index)).join("")}</div>
          <div class="actions">
            <button class="primary" type="submit">Guardar</button>
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
