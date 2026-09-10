/**
 * /designer_tools -- reads the compiled asset bundle and reports what its gray
 * tokens amount to, with a column showing the same thing under values you
 * type. See web/views/designer_tools_templates.xml for the markup.
 *
 * Plain script on purpose, loaded at the end of the body: it needs the DOM and
 * has nothing to export.
 */
"use strict";

// Two modes in one file: with no parameter the page is the two-column shell;
// with `?panel=1` it is only the measured content, and that is the form both
// iframes load.
const PARAMS = new URLSearchParams(location.search);
const MODE = PARAMS.has("panel") ? "panel" : PARAMS.has("preview") ? "preview" : "shell";

// The eleven steps, in order. --white and --black sit at both ends because
// they are *swapped* in dark mode: $o-white is #000 there.
const RAMP = ["white", "gray-100", "gray-200", "gray-300", "gray-400", "gray-500",
              "gray-600", "gray-700", "gray-800", "gray-900", "black"];

// Only variables that are actually defined on :root.
const NAMED = ["body-bg", "secondary-bg", "tertiary-bg", "border-color",
               "body-color", "secondary-color", "tertiary-color", "emphasis-color"];

// [label, markup to instantiate, selector of the node to measure].
const PARTS = [
    ["card", `<div class="card"></div>`],
    ["card-header", `<div class="card"><div class="card-header"></div></div>`, ".card-header"],
    ["dropdown-menu", `<div class="dropdown-menu"></div>`],
    ["dropdown-item", `<div class="dropdown-menu"><a class="dropdown-item" href="#"></a></div>`, ".dropdown-item"],
    ["dropdown-header", `<div class="dropdown-menu"><h6 class="dropdown-header"></h6></div>`, ".dropdown-header"],
    ["popover", `<div class="popover"></div>`],
    ["tooltip-inner", `<div class="tooltip"><div class="tooltip-inner"></div></div>`, ".tooltip-inner"],
    ["form-control", `<input class="form-control"/>`],
    ["form-check-input", `<input class="form-check-input" type="checkbox"/>`],
    ["btn-secondary", `<button class="btn btn-secondary"></button>`],
    ["kbd", `<kbd></kbd>`],
];

// -- Color math -----------------------------------------------------------

function parse(value) {
    const n = (value.match(/[\d.]+/g) || [0, 0, 0]).map(Number);
    return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
}

/** `fg` laid over `bg`. */
function over(fg, bg) {
    if (fg.a >= 1) {
        return fg;
    }
    return {
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1,
        alpha: fg.a,
    };
}

const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
const lstar = (c) => { const y = lum(c); return y > 0.008856 ? 116 * y ** (1 / 3) - 16 : 903.3 * y; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const readable = (c) => ratio(c, { r: 0, g: 0, b: 0 }) >= ratio(c, { r: 255, g: 255, b: 255 }) ? "#000" : "#fff";
const cls = (v, bad, warn) => v < bad ? "bad" : v < warn ? "warn" : "";

/**
 * An undefined custom property computes to rgba(0, 0, 0, 0), which hex() would
 * print as #000000 -- indistinguishable from real black, and in the editor it
 * would go back out as a value to apply. Say so instead.
 */
const shown = (c) => (c.a > 0 ? hex(c) : "(undefined)");
const num = (c, value) => (c.a > 0 ? value : "—");

/** "#ABC" or "#aabbcc" -> "#aabbcc". Returns null when it is not a color. */
function normalizeHex(value) {
    const m = String(value).trim().match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (!m) {
        return null;
    }
    const h = m[1].toLowerCase();
    return "#" + (h.length === 3 ? h.split("").map((c) => c + c).join("") : h);
}

// Dark mode is an enterprise addition: web_enterprise inherits this template
// to add the dark stylesheet and the Light/Dark control. Without them the tool
// is light-only and every scheme branch below collapses to it.
const DARK_LINK = document.getElementById("css-dark");
const HAS_DARK = Boolean(DARK_LINK);

/** Enables the sheet for `scheme` and returns the one actually in use. */
function useScheme(scheme) {
    const used = HAS_DARK && scheme === "dark" ? "dark" : "light";
    document.getElementById("css-light").disabled = used === "dark";
    if (DARK_LINK) {
        DARK_LINK.disabled = used !== "dark";
    }
    document.documentElement.dataset.scheme = used;
    return used;
}

const activeLink = () =>
    document.documentElement.dataset.scheme === "dark" ? DARK_LINK : document.getElementById("css-light");

/**
 * Re-enabling a <link> is not synchronous: the sheet has to be fetched or
 * re-parsed first, and reading a variable in the meantime yields transparent.
 * That is how switching schemes filled the editor with #000000 across the
 * board. Waits until the enabled sheet actually answers.
 */
function schemeReady() {
    return new Promise((done) => {
        const tick = (tries = 0) => {
            if (resolve("body-bg").a > 0) {
                done(true);
            } else if (tries > 180) {
                done(false);
            } else {
                requestAnimationFrame(() => tick(tries + 1));
            }
        };
        tick();
    });
}

/**
 * Every measurement here reads the compiled bundle. When that stylesheet does
 * not load, every custom property resolves to rgba(0, 0, 0, 0) and the whole
 * page quietly fills with black -- values, contrasts and all. That silence is
 * worse than the failure, so say it, and name the URL to open.
 */
function reportSheetFailure() {
    const link = activeLink();
    const banner = document.createElement("div");
    banner.className = "sheet-failure";
    banner.innerHTML =
        "<b>The compiled stylesheet did not load.</b> Every value below is " +
        "meaningless until it does — an unresolved variable reads as black. " +
        "Open <a target=\"_blank\">this URL</a> to see what the server answers.";
    const anchor = banner.querySelector("a");
    anchor.href = link ? link.href : "/web/assets/debug/web.assets_web.css";
    anchor.textContent = anchor.getAttribute("href");
    document.body.prepend(banner);
    return banner;
}

/**
 * The background actually visible behind `node`: walk up the parent chain to
 * the first opaque background, then flatten the translucent layers back down.
 * Without this a .dropdown-item -- which has no background of its own -- would
 * be measured against --body-bg instead of its menu's background.
 */
function effectiveBg(node) {
    const layers = [];
    for (let el = node; el; el = el.parentElement) {
        const c = parse(getComputedStyle(el).backgroundColor);
        if (c.a > 0) {
            layers.push(c);
        }
        if (c.a >= 1) {
            break;
        }
    }
    let bg = layers.pop() || { r: 255, g: 255, b: 255, a: 1 };
    while (layers.length) {
        bg = over(layers.pop(), bg);
    }
    return bg;
}

/** Resolved value of a variable, flattened over `bg` when translucent. */
function resolve(name, bg) {
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;opacity:0;background-color:var(--${name})`;
    document.body.appendChild(probe);
    const c = parse(getComputedStyle(probe).backgroundColor);
    probe.remove();
    return bg ? over(c, bg) : c;
}

// -- Rendering ------------------------------------------------------------

function render() {
    const bodyBg = resolve("body-bg");

    // The ramp.
    const strip = document.getElementById("strip");
    const rampBody = document.querySelector("#ramp-table tbody");
    strip.innerHTML = "";
    rampBody.innerHTML = "";
    let previous = null;
    for (const name of RAMP) {
        const c = resolve(name, bodyBg);
        const l = lstar(c);
        const delta = previous === null ? null : Math.abs(l - lstar(previous));

        const cell = document.createElement("div");
        cell.style.cssText = `background-color:var(--${name});color:${readable(c)}`;
        cell.innerHTML = `<b>${name.replace(/^gray-/, "")}</b><span>${shown(c)}</span><span>L* ${num(c, l.toFixed(1))}</span>`;
        strip.appendChild(cell);

        const tr = document.createElement("tr");
        tr.innerHTML =
            `<td><span class="chip" style="background-color:var(--${name})"></span></td>` +
            `<td><code>--${name}</code></td><td>${shown(c)}</td>` +
            `<td class="num">${num(c, l.toFixed(1))}</td>` +
            `<td class="num ${delta === null ? "" : cls(delta, 4, 7)}">${delta === null ? "—" : delta.toFixed(1)}</td>` +
            `<td class="num">${previous === null ? "—" : ratio(c, previous).toFixed(2) + ":1"}</td>`;
        rampBody.appendChild(tr);
        previous = c;
    }

    // The root variables.
    const namedBody = document.querySelector("#named-table tbody");
    namedBody.innerHTML = "";
    for (const name of NAMED) {
        const c = resolve(name, bodyBg);
        const r = ratio(c, bodyBg);
        const tr = document.createElement("tr");
        tr.innerHTML =
            `<td><span class="chip" style="background-color:var(--${name})"></span></td>` +
            `<td><code>--${name}</code>${c.alpha ? ` <small>α ${c.alpha}</small>` : ""}</td>` +
            `<td>${shown(c)}</td><td class="num">${num(c, lstar(c).toFixed(1))}</td>` +
            `<td class="num ${cls(r, 1.5, 4.5)}">${r.toFixed(2)}:1</td>`;
        namedBody.appendChild(tr);
    }

    // The components, measured on real elements.
    const partsBody = document.querySelector("#parts-table tbody");
    partsBody.innerHTML = "";
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-9999px;top:0";
    document.body.appendChild(host);
    for (const [label, markup, selector] of PARTS) {
        host.innerHTML = markup;
        const node = selector ? host.querySelector(selector) : host.firstElementChild;
        const style = getComputedStyle(node);
        const bg = effectiveBg(node);
        const text = over(parse(style.color), bg);
        const textRatio = ratio(text, bg);
        const hasBorder = parseFloat(style.borderTopWidth) > 0;
        const border = hasBorder ? over(parse(style.borderTopColor), bg) : null;
        const borderRatio = border ? ratio(border, bg) : null;

        const tr = document.createElement("tr");
        tr.innerHTML =
            `<td><span class="chip" style="background-color:${hex(bg)}"></span></td>` +
            `<td><code>${label}</code></td>` +
            `<td>${hex(bg)}${bg.alpha ? ` <small>α ${bg.alpha}</small>` : ""}</td>` +
            `<td class="num">${lstar(bg).toFixed(1)}</td>` +
            `<td>${border ? hex(border) : "—"}</td>` +
            `<td class="num ${border ? cls(borderRatio, 1.5, 3) : ""}">${border ? borderRatio.toFixed(2) + ":1" : "—"}</td>` +
            `<td>${hex(text)}</td>` +
            `<td class="num ${cls(textRatio, 3, 4.5)}">${textRatio.toFixed(2)}:1</td>`;
        partsBody.appendChild(tr);
    }
    host.remove();
}

// == PANEL: the measured content ==========================================

// == Palette override, shared by the panel and the preview ================

/**
 * Installs a <style> that can hold a rewritten copy of the bundle, and hands
 * back the function that fills it. Both the After column and the preview page
 * need it, so it does not belong to either.
 */
function createPatcher() {
// Anchored between the sheets under test and the page's own chrome: the
// patch has to beat the original bundle by source order without letting
// Bootstrap win the layout back at equal specificity.
const patch = document.createElement("style");
document.head.insertBefore(patch, document.getElementById("chrome-anchor"));
let baseCss = null;

/**
 * Rewrites the compiled bundle CSS, substituting colors.
 *
 * Going through the text of the sheet is the only way: Bootstrap compiles
 * most of its surfaces to literal hex (`.card{background-color:#25262B}`)
 * rather than `var()`, so redefining --gray-300 would change almost
 * nothing. The substitution is purely textual, with everything that
 * implies -- see the warning in the editor.
 */
async function applyOverrides(values) {
    // Start over from the original bundle to read the source values,
    // otherwise we would be measuring the previous substitution.
    patch.textContent = "";
    const pairs = [];
    const claimed = new Map();
    for (const [name, raw] of Object.entries(values)) {
        const to = normalizeHex(raw);
        const from = normalizeHex(hex(resolve(name)));
        if (!to || !from || to === from) {
            continue;
        }
        // Two tokens can share a color -- $border-color is $o-gray-300.
        // The substitution being textual, the first one takes everything:
        // say so, rather than showing a "0 occurrences" that reads as a
        // failure.
        pairs.push({ name, from, to, shadowedBy: claimed.get(from) });
        claimed.set(from, claimed.get(from) || name);
    }
    if (!pairs.length) {
        render();
        return { pairs: [] };
    }
    baseCss ??= stripUnsafe(await fetch(activeLink().href).then((r) => r.text()));
    let css = baseCss;
    for (const pair of pairs) {
        if (pair.shadowedBy) {
            pair.count = 0;
            continue;
        }
        const out = substitute(css, pair.from, pair.to);
        css = out.css;
        pair.count = out.count;
    }
    patch.textContent = css;
    render();
    return { pairs };
}

/**
 * The bundle text is re-injected into a <style> of this page, where
 * relative `url()` no longer resolve against /web/assets/. Drop the
 * @font-face blocks (no colors in them) and absolutise the rest.
 */
function stripUnsafe(css) {
    const base = new URL(activeLink().href);
    return css
        .replace(/@font-face\s*\{[^}]*\}/g, "")
        .replace(/url\((\s*['"]?)(?!data:|https?:|\/|#)([^'")]+)(['"]?\s*)\)/g,
                 (m, a, path, b) => `url(${a}${new URL(path, base).pathname}${b})`);
}

/** Every spelling of one color in a CSS text. */
function substitute(css, from, to) {
    const short = from.match(/^#(.)\1(.)\2(.)\3$/i);
    const shortTo = to.match(/^#(.)\1(.)\2(.)\3$/i);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(from.slice(i, i + 2), 16));
    const [tr, tg, tb] = [1, 3, 5].map((i) => parseInt(to.slice(i, i + 2), 16));
    let count = 0;

    // Six digits, any case. The lookahead avoids biting into a #rrggbbaa.
    css = css.replace(new RegExp(from + "(?![0-9a-f])", "gi"), () => (count++, to));
    // Short form, only when the source color has one.
    if (short) {
        const s = "#" + short.slice(1, 4).join("");
        const st = shortTo ? "#" + shortTo.slice(1, 4).join("") : to;
        css = css.replace(new RegExp(s + "(?![0-9a-f])", "gi"), () => (count++, st));
    }
    // Encoded spelling inside Bootstrap's SVG data-URIs (%23fff).
    css = css.replace(new RegExp("%23" + from.slice(1) + "(?![0-9a-f])", "gi"), () => (count++, "%23" + to.slice(1)));
    if (short) {
        const s = short.slice(1, 4).join("");
        css = css.replace(new RegExp("%23" + s + "(?![0-9a-f])", "gi"), () => (count++, "%23" + to.slice(1)));
    }
    // rgb()/rgba(): Odoo writes a lot of rgba($o-gray-900, .5). Matched
    // case-insensitively because Bootstrap's text-emphasis-variant emits
    // `RGBA(` in caps -- 499 of them in the dark bundle -- and a "g"-only
    // flag silently missed every text color built that way.
    css = css.replace(
        new RegExp(`(rgba?\\(\\s*)${r}(\\s*[,\\s]\\s*)${g}(\\s*[,\\s]\\s*)${b}\\b`, "gi"),
        (m, p1, p2, p3) => (count++, `${p1}${tr}${p2}${tg}${p3}${tb}`)
    );
    return { css, count };
}

    return applyOverrides;
}

function initPanel() {
    useScheme(PARAMS.get("scheme"));
    const applyOverrides = createPatcher();

    // The parent posts the overrides on this frame's load event. Awaiting
    // anything before listening means that message can land while no listener
    // exists yet, and it is simply dropped -- the After column then stays on
    // the untouched bundle. So: listen first, and let the handler wait.
    const ready = schemeReady().then((ok) => {
        if (!ok) {
            reportSheetFailure();
        }
        render();
    });

    // Measure #panel, not scrollHeight: the shell sets the iframe height, so
    // scrollHeight falls back to the frame height and adds the body padding on
    // top every time -- the height grew without end.
    const content = document.getElementById("panel");
    const report = () => parent.postMessage({
        type: "height",
        value: Math.ceil(content.getBoundingClientRect().height + 48),
    }, "*");
    ready.then(report);
    new ResizeObserver(report).observe(content);

    window.addEventListener("message", async (ev) => {
        const msg = ev.data;
        if (!msg || typeof msg !== "object") {
            return;
        }
        await ready;
        if (msg.type === "overrides") {
            const result = await applyOverrides(msg.values);
            parent.postMessage({ type: "applied", ...result }, "*");
            report();
        }
    });

    document.addEventListener("keydown", forwardKey);
}

// == PREVIEW: a static kanban view wearing the values =====================

/**
 * A separate tab showing the values on something that looks like the product
 * kanban, built from the real webclient classes. The values travel in the
 * URL hash rather than through postMessage, so the tab survives a reload and
 * can be kept side by side with the webclient.
 */
async function initPreview() {
    const scheme = useScheme(PARAMS.get("scheme"));
    if (!(await schemeReady())) {
        reportSheetFailure();
    }
    document.getElementById("mockup-scheme").textContent = `${scheme} bundle`;

    const text = decodeURIComponent(location.hash.slice(1));
    const values = {};
    for (const line of text.split("\n")) {
        const match = line.match(/^\s*\$?(?:o-)?([a-z0-9-]+)\s*:\s*(#[0-9a-f]{6}|#[0-9a-f]{3})\s*;?\s*$/i);
        if (match) {
            values[match[1].toLowerCase()] = match[2];
        }
    }

    // Each entry keeps the values and the scheme, so hopping between screens
    // never loses what is being tried.
    for (const link of document.querySelectorAll("#mockup-nav a")) {
        const target = link.dataset.screen;
        link.href = `?preview=1&screen=${target}&scheme=${scheme}${location.hash}`;
        link.classList.toggle("active", target === PARAMS.get("screen"));
    }

    const applyOverrides = createPatcher();
    const { pairs } = await applyOverrides(values);
    document.getElementById("mockup-values").textContent = pairs.length
        ? `${pairs.length} value${pairs.length === 1 ? "" : "s"} applied: ` +
          pairs.map((p) => `${p.name} ${p.to}`).join(", ")
        : "no value changed — this is the bundle as it stands";
}

// == SHELL: editor + two columns ==========================================

function initShell() {
    const before = document.getElementById("before");
    const after = document.getElementById("after");
    const rows = document.getElementById("rows");
    const area = document.getElementById("text");
    const status = document.getElementById("status");
    const copyButton = document.getElementById("copy");
    const previewButton = document.getElementById("preview");
    const previewMenu = document.getElementById("preview-menu");
    const copyIcon = copyButton.querySelector("i");
    const copyTitle = copyButton.title;
    let copyTimer;
    const heights = new Map();
    let scheme = localStorage.getItem("designerToolsScheme") ||
        (document.cookie.includes("color_scheme=dark") ? "dark" : "light");

    const storeKey = () => `designerToolsValues:${scheme}`;
    const defaults = () => RAMP.map((n) => `${n}: ${shown(resolve(n))}`).join("\n");

    /**
     * What the editor opens on. The stored set used to replace the ramp
     * outright, so a saved two-line experiment left the editor showing two
     * lines with no way back to the palette. The bundle always supplies the
     * full ramp; stored values override it, and any extra variable that was
     * added by hand is kept underneath.
     */
    function storedLines() {
        const stored = parseValues(localStorage.getItem(storeKey()) || "").values;
        const ramp = RAMP.map((name) => `${name}: ${stored[name] || shown(resolve(name))}`);
        const extra = Object.entries(stored)
            .filter(([name]) => !RAMP.includes(name))
            .map(([name, value]) => `${name}: ${value}`);
        return ramp.concat(extra).join("\n");
    }

    // The editor stays textual, one line per value -- that is what allows
    // pasting a block of SCSS and naming any variable at all. One field per
    // line, simply so a color picker can sit next to each one.
    // Two views over the very same lines: one field per value with its color
    // picker, or a plain textarea to paste a block into. `editor` says which
    // one is authoritative right now.
    let editor = localStorage.getItem("designerToolsEditor") === "text" ? "text" : "rows";

    const lines = () => (editor === "text"
        ? area.value.split("\n")
        : [...rows.querySelectorAll(`input[type="text"]`)].map((input) => input.value)
    ).filter((value) => value.trim());

    /** Fills both views, so switching never loses what was typed. */
    function setLines(value) {
        rows.replaceChildren(...value.split("\n").filter((l) => l.trim()).map(makeLine));
        area.value = value;
    }

    function setEditor(next) {
        const current = lines().join("\n");   // read the view being left
        editor = next;
        localStorage.setItem("designerToolsEditor", next);
        rows.hidden = next !== "rows";
        area.hidden = next !== "text";
        for (const btn of document.querySelectorAll("[data-editor]")) {
            btn.classList.toggle("active", btn.dataset.editor === next);
        }
        setLines(current);
    }

    function makeLine(text) {
        const line = document.createElement("div");
        line.className = "row-line";

        const picker = document.createElement("input");
        picker.type = "color";
        const field = document.createElement("input");
        field.type = "text";
        field.spellcheck = false;
        field.placeholder = "token: #hex";
        field.value = text;

        const syncPicker = () => {
            const found = field.value.match(/#[0-9a-f]{6}|#[0-9a-f]{3}/i);
            picker.disabled = !found;
            picker.value = found ? normalizeHex(found[0]) : "#000000";
        };
        syncPicker();

        // `input` follows the drag inside the swatch, `change` only fires on
        // commit: rewriting 1.2 MB of CSS on every pixel would be unusable, so
        // the preview runs off `change`.
        picker.addEventListener("input", () => {
            field.value = field.value.replace(/#[0-9a-f]{3,6}/i, picker.value.toUpperCase());
        });
        picker.addEventListener("change", apply);

        field.addEventListener("input", syncPicker);

        // A pasted block spreads over as many lines. This has to be caught on
        // `paste`: a text input strips line breaks out of its own value, so by
        // the time `input` fires there is nothing multi-line left to split.
        field.addEventListener("paste", (ev) => {
            const text = ev.clipboardData?.getData("text") || "";
            if (!text.includes("\n")) {
                return;
            }
            ev.preventDefault();
            const parts = text.split("\n").map((l) => l.trim()).filter(Boolean);
            field.value = parts.shift() || "";
            for (const part of parts.reverse()) {
                line.after(makeLine(part));
            }
            syncPicker();
        });
        field.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
                ev.preventDefault();
                apply();
            }
        });

        line.append(picker, field);
        return line;
    }

    function measureHeader() {
        const h = document.querySelector("#shell header").offsetHeight;
        document.documentElement.style.setProperty("--head-h", `${h}px`);
    }

    /**
     * Switching schemes has to wait for the sheet, so two quick clicks overlap:
     * the older call would come back and fill the editor with the ramp of the
     * scheme just left, which then went out as if those were overrides -- the
     * After column ended up a mix of both palettes. Only the latest call gets
     * to finish.
     */
    let schemeRun = 0;

    async function setScheme(next) {
        const run = ++schemeRun;
        scheme = useScheme(next);
        for (const btn of document.querySelectorAll("button[data-scheme]")) {
            btn.classList.toggle("active", btn.dataset.scheme === scheme);
        }
        localStorage.setItem("designerToolsScheme", scheme);
        // `scheme` and not `next` from here on: without a dark sheet, useScheme
        // hands back light whatever was asked for.
        const ok = await schemeReady();
        if (run !== schemeRun) {
            return;
        }
        if (!ok) {
            reportSheetFailure();
        }
        setLines(storedLines());
        document.getElementById("scheme-label").textContent = scheme;
        heights.clear();
        before.src = `?panel=1&scheme=${scheme}`;
        after.src = `?panel=1&scheme=${scheme}`;
        measureHeader();
    }

    /** `gray-100: #123456`, `$o-gray-100: #123456;`, `// comment`. */
    function parseValues(text) {
        const values = {};
        const bad = [];
        for (const line of text.split("\n")) {
            if (!line.trim() || /^\s*(\/\/|#\s)/.test(line)) {
                continue;
            }
            const m = line.match(/^\s*\$?(?:o-)?([a-z0-9-]+)\s*:\s*(#[0-9a-f]{6}|#[0-9a-f]{3})\s*;?\s*$/i);
            if (m) {
                values[m[1].toLowerCase()] = m[2];
            } else {
                bad.push(line.trim());
            }
        }
        return { values, bad };
    }

    function apply() {
        const text = lines().join("\n");
        const { values, bad } = parseValues(text);
        localStorage.setItem(storeKey(), text);
        status.innerHTML = bad.length
            ? `<span class="bad">${bad.length} line(s) ignored</span>: <code>${bad[0]}</code>`
            : "Applying…";
        after.contentWindow.postMessage({ type: "overrides", values }, "*");
    }

    window.addEventListener("message", (ev) => {
        const msg = ev.data;
        if (!msg || typeof msg !== "object") {
            return;
        }
        if (msg.type === "height") {
            const which = ev.source === after.contentWindow ? "after" : "before";
            heights.set(which, msg.value);
            const tallest = Math.max(...heights.values());
            before.style.height = after.style.height = `${tallest}px`;
        } else if (msg.type === "key") {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: msg.key }));
        } else if (msg.type === "applied") {
            // Say it in the column head too: with nothing stored for the
            // current scheme the two columns are identical, and a header still
            // reading "your values" makes that look like a failure to update.
            document.getElementById("after-label").textContent = msg.pairs.length
                ? `${msg.pairs.length} value${msg.pairs.length === 1 ? "" : "s"} applied`
                : `nothing set for ${scheme} — same as Before`;
            status.innerHTML = msg.pairs.length
                ? `<table><tbody>${msg.pairs.map((p) =>
                    `<tr><td>${p.name}</td><td>${p.from} → ${p.to}</td>` +
                    `<td class="${p.shadowedBy ? "warn" : "num"}">${p.shadowedBy
                        ? `same color as ${p.shadowedBy}, already replaced`
                        : `${p.count} occurrence${p.count === 1 ? "" : "s"}`}</td></tr>`
                  ).join("")}</tbody></table>`
                : "No value changed: both columns are identical.";
        }
    });

    after.addEventListener("load", () => {
        const { values } = parseValues(lines().join("\n"));
        after.contentWindow.postMessage({ type: "overrides", values }, "*");
    });

    /**
     * Opens the values on something that looks like a real kanban view, in a
     * new tab. Nothing is written anywhere: the values ride in the URL hash.
     */
    function preview(screenKey) {
        const url = `?preview=1&screen=${screenKey}&scheme=${scheme}` +
            `#${encodeURIComponent(lines().join("\n"))}`;
        window.open(url, "_blank");
    }

    /**
     * The values live in localStorage and nowhere else -- not in the database,
     * not in the file -- so copying them out is the only way to share a set or
     * to carry it over to another host.
     */
    async function copy() {
        const text = lines().join("\n");
        let done = false;
        try {
            // navigator.clipboard only exists in a secure context, so it is
            // missing as soon as the server is reached by IP over plain HTTP
            // (--http-interface=0.0.0.0).
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                done = true;
            }
        } catch {
            done = false;
        }
        if (!done) {
            const scratch = document.createElement("textarea");
            scratch.value = text;
            scratch.style.cssText = "position:fixed;top:-1000px;opacity:0";
            document.body.appendChild(scratch);
            scratch.select();
            try {
                done = document.execCommand("copy");
            } catch {
                done = false;
            }
            scratch.remove();
        }
        // The button carries no label to swap, so the feedback rides on the
        // icon and the tooltip. The original title is captured once, outside:
        // reading it here would pick up the swapped one on a double click.
        clearTimeout(copyTimer);
        copyIcon.dataset.icon = done ? "check" : "content_copy";
        copyButton.title = done ? "Copied" : "Copy failed — the values are printed below";
        copyTimer = setTimeout(() => {
            copyIcon.dataset.icon = "content_copy";
            copyButton.title = copyTitle;
        }, 1500);
        if (!done) {
            status.innerHTML = `<pre style="margin:.5rem 0 0;white-space:pre-wrap">${text}</pre>`;
        }
    }

    for (const btn of document.querySelectorAll("[data-editor]")) {
        btn.addEventListener("click", () => setEditor(btn.dataset.editor));
    }
    // Enter inserts a newline in a textarea, so applying takes the modifier.
    area.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
            ev.preventDefault();
            apply();
        }
    });

    document.getElementById("apply").addEventListener("click", apply);
    copyButton.addEventListener("click", copy);
    // Bootstrap's dropdown JS is not on this page, so the toggle is ours: four
    // lines, and the menu keeps the real .dropdown-menu styling under review.
    previewButton.addEventListener("click", (ev) => {
        ev.stopPropagation();
        previewMenu.classList.toggle("show");
    });
    document.addEventListener("click", () => previewMenu.classList.remove("show"));
    previewMenu.addEventListener("click", (ev) => {
        const item = ev.target.closest("[data-screen]");
        if (item) {
            ev.preventDefault();
            previewMenu.classList.remove("show");
            preview(item.dataset.screen);
        }
    });
    document.getElementById("reset").addEventListener("click", () => {
        setLines(defaults());
        localStorage.removeItem(storeKey());
        apply();
    });
    for (const btn of document.querySelectorAll("button[data-scheme]")) {
        btn.addEventListener("click", () => setScheme(btn.dataset.scheme));
    }
    document.addEventListener("keydown", (ev) => {
        if (ev.ctrlKey || ev.metaKey || ev.altKey || /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) {
            return;
        }
        if (ev.key === "d" && HAS_DARK) {
            setScheme(scheme === "dark" ? "light" : "dark");
        }
    });

    addEventListener("resize", measureHeader);
    setEditor(editor);
    setScheme(scheme);
}

/** Inside a panel, `d` and `x` must act on the shell, not on the iframe. */
function forwardKey(ev) {
    if (parent !== window && !ev.ctrlKey && !ev.metaKey && "dx".includes(ev.key)) {
        parent.postMessage({ type: "key", key: ev.key }, "*");
    }
}

if (MODE === "panel") {
    initPanel();
} else if (MODE === "preview") {
    initPreview();
} else {
    initShell();
}
