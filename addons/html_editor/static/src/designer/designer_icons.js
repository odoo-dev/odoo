/**
 * /designer_tools/icons -- browse the Material Symbols this build ships, pick
 * a fill and a size, copy the markup or the SVG. See
 * html_editor/views/designer_icons_templates.xml for the page.
 *
 * Plain script on purpose, loaded at the end of the body: it needs the DOM and
 * has nothing to export. It is in no asset bundle, and the guard at the bottom
 * keeps it inert should a glob ever pull it into one.
 */
"use strict";

/**
 * The font is a *subset*: the build only keeps the icons of
 * web/tooling/icons/icons_wishlist.txt, and a name outside it renders as its
 * own letters. So the list has to come from the server, which is also the only
 * place the search tags exist -- they are matched there and never shipped
 * (see web/icons.py and the search_icons() the route calls).
 */
const SEARCH_URL = "/html_editor/icons_search";

/**
 * Same road the "Regenerate Assets" item of the debug menu takes
 * (web/static/src/core/debug/debug_menu_items.js): the ORM method drops every
 * compiled bundle attachment, and the next request rebuilds them from source.
 * Reused rather than given a route of its own -- a route that lets any logged
 * in user flush the bundles is a permission surface this page does not need.
 */
async function regenerateAssets() {
    const response = await fetch("/web/dataset/call_kw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            id: 1,
            jsonrpc: "2.0",
            method: "call",
            params: {
                model: "ir.attachment",
                method: "regenerate_assets_bundles",
                args: [],
                kwargs: {},
            },
        }),
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
        throw new Error(`${response.status} ${response.statusText || "error"} on /web/dataset/call_kw`);
    }
    const { error } = await response.json();
    if (error) {
        // Dropping those attachments needs the rights to unlink what the
        // superuser created, which a plain internal user does not have.
        throw new Error(error.data?.message || error.message || "call failed");
    }
}

/**
 * Google's icon CDN, the only place a vector of a shipped glyph can be had:
 * the font is a font, and tracing a glyph back out of it in the browser is not
 * a thing. It is an external host, so every call here can fail on an offline
 * or proxied install -- which is why the two buttons that use it report the
 * failure instead of silently doing nothing, and why nothing else on the page
 * depends on it.
 */
const SVG_URL = (name, variant) =>
    `https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/${name}/${variant}/24px.svg`;

async function searchIcons(needle) {
    const response = await fetch(SEARCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "call", params: { needle } }),
    });
    // Everything that goes wrong before the route is reached answers with an
    // HTML page -- a missing route, an expired session, the database selector
    // -- and response.json() then fails on "<!doctype" with a message that
    // names neither the URL nor the status. Say what actually happened.
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
        throw new Error(
            `${response.status} ${response.statusText || "error"} on ${SEARCH_URL} — ` +
            (response.status === 404
                ? "that route belongs to the html_editor addon, which does not seem installed on this database."
                : response.redirected
                ? `the server redirected to ${response.url}, so this session is probably not logged in.`
                : `the server answered ${contentType || "an unnamed type"} instead of JSON.`)
        );
    }
    const { result, error } = await response.json();
    if (error) {
        throw new Error(error.data?.message || error.message || "search failed");
    }
    return result;
}

/**
 * "shopping cart" should find what carries both words, which one `needle in
 * haystack` on the server cannot do. Each word is searched on its own and the
 * results intersected here -- a couple of requests, against shipping every
 * tag of every icon to the browser just to filter locally.
 */
async function searchAllTerms(needle) {
    const terms = needle.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length <= 1) {
        return searchIcons(terms[0] || "");
    }
    const rounds = await Promise.all(terms.map((term) => searchIcons(term)));
    const counts = new Map();
    for (const round of rounds) {
        for (const icon of round) {
            counts.set(icon.name, (counts.get(icon.name) || 0) + 1);
        }
    }
    return rounds[0].filter((icon) => counts.get(icon.name) === terms.length);
}

/**
 * The size classes, read off the compiled bundle instead of being repeated
 * here: $icon-sizes in web/static/src/webclient/icons.scss stays the only
 * place they are written down, and a step added there shows up in the stepper
 * without touching this file.
 *
 * Only the `.oi-x` rules carrying a font-size qualify, which is what tells a
 * size apart from `.oi-filled`, `.oi-fw` or `.oi-spin`. The hyphen left out of
 * the character class is what keeps `.oi-stack-2x` out.
 */
function discoverSizes() {
    const sizes = [];
    for (const sheet of document.styleSheets) {
        let rules;
        try {
            rules = sheet.cssRules;
        } catch {
            // A cross-origin sheet throws on access. None here, but reading
            // every sheet in the document is not ours to assume.
            continue;
        }
        for (const rule of rules) {
            const name = rule.selectorText?.match(/^\.oi-([a-z0-9]+)$/)?.[1];
            if (name && rule.style?.fontSize) {
                sizes.push({ name, value: rule.style.fontSize });
            }
        }
    }
    return sizes;
}

// == Page ================================================================

function initIcons() {
    const searchInput = document.getElementById("search");
    const status = document.getElementById("status");
    const grid = document.getElementById("grid");
    const countBadge = document.getElementById("count");
    const toast = document.getElementById("toast");
    const sizeValue = document.getElementById("size-value");

    let icons = [];
    let filled = false;
    /** The full list, fetched once: it only changes with the icon font. */
    let allIcons = null;

    // == Sizes ===========================================================

    // The default size is the absence of a class, so it cannot be discovered;
    // $oi-default-size is 1em, which is the 14px of the webclient.
    const SIZES = [{ name: "", value: "1em" }, ...discoverSizes()];
    let sizeIndex = 0;

    const sizeClass = () => (SIZES[sizeIndex].name ? `oi-${SIZES[sizeIndex].name}` : "");

    /**
     * The glyph wears the real size class rather than a font-size computed
     * here: what the grid shows is then literally what the markup produces.
     * The cell has to grow with it, or the tile clips the thing it exists to
     * show -- hence --cell-min, from the em value read off the bundle.
     */
    function applySize() {
        const { name, value } = SIZES[sizeIndex];
        sizeValue.textContent = name ? `oi-${name}` : "default";
        document.getElementById("size-down").disabled = sizeIndex === 0;
        document.getElementById("size-up").disabled = sizeIndex === SIZES.length - 1;
        const em = parseFloat(value) || 1;
        // The glyph is `em` times the 14px base; the rest is the label and
        // the padding. Floored at 6rem so the default size keeps the grid
        // dense rather than airy.
        grid.style.setProperty("--cell-min", `${Math.max(6, em * 0.875 + 4)}rem`);
        redressGrid();
    }

    // == Cells ===========================================================

    /**
     * An icon without a filled shape in the font is shown outline whatever the
     * switcher says, and says so: rendering it as if it were filled, or
     * handing out markup with an `oi-filled` that does nothing, would both be
     * lies. `has_fill` comes from the build, which compared the two glyphs.
     */
    const isFilled = (icon) => filled && icon.has_fill;

    function markupFor(icon) {
        const classes = ["oi"];
        if (isFilled(icon)) {
            classes.push("oi-filled");
        }
        const size = sizeClass();
        if (size) {
            classes.push(size);
        }
        return `<i class="${classes.join(" ")}" data-icon="${icon.name}"/>`;
    }

    function dressCell(cell, icon) {
        // `.glyph` and not `.oi`: the action buttons carry an `.oi` of their
        // own, and querying the class this function is about to write finds
        // whichever element already has it -- which was the copy button.
        const glyph = cell.querySelector(".glyph");
        glyph.className = ["glyph", "oi", isFilled(icon) && "oi-filled", sizeClass()]
            .filter(Boolean)
            .join(" ");
        cell.classList.toggle("no-fill", filled && !icon.has_fill);
        cell.title = markupFor(icon);
    }

    function actionButton(cls, dataIcon, label) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `cell-action ${cls}`;
        button.setAttribute("aria-label", label);
        button.title = label;
        const glyph = document.createElement("i");
        glyph.className = "oi";
        glyph.dataset.icon = dataIcon;
        glyph.setAttribute("aria-hidden", "true");
        button.append(glyph);
        return button;
    }

    function renderGrid() {
        const fragment = document.createDocumentFragment();
        for (const icon of icons) {
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "cell";
            cell.setAttribute("role", "listitem");
            cell.dataset.name = icon.name;

            const glyph = document.createElement("i");
            glyph.className = "glyph oi";
            glyph.dataset.icon = icon.name;
            glyph.setAttribute("aria-hidden", "true");
            cell.append(glyph);

            const label = document.createElement("span");
            label.className = "name";
            label.textContent = icon.name;
            cell.append(label);

            cell.append(actionButton("copy-svg", "content_copy", `Copy ${icon.name}.svg`));
            cell.append(actionButton("download-svg", "download", `Download ${icon.name}.svg`));

            dressCell(cell, icon);
            fragment.append(cell);
        }
        grid.replaceChildren(fragment);
    }

    /**
     * The list and the font are two different artefacts of the same build --
     * web/icons.py and the .woff2, both written by generate_icons.py -- and
     * nothing guarantees the server is serving them from the same state.
     *
     * A listed name the font has no glyph for renders at width 0, not as its
     * own letters: the subset's cmap keeps only what its ligatures are spelled
     * with, so an unknown name draws nothing at all. A resolved glyph measures
     * exactly one em. Measuring is the only way to see it -- no API answers
     * "does this font have a glyph for this ligature".
     *
     * Must not run before the icon font is in: `font-display: block` leaves
     * the fallback metrics in place while it loads, so every tile measures as
     * wide as its name and the whole grid reads as broken. Waiting on
     * document.fonts is what tells the two apart.
     *
     * Reading every box forces one layout, then the values are cached; doing
     * it per cell inside the render loop would force one per cell.
     */
    async function checkGlyphs() {
        try {
            await document.fonts?.ready;
        } catch {
            // No Font Loading API: the measurement below may be early, and a
            // false alarm about the font is worse than no alarm at all.
            return 0;
        }
        let unresolved = 0;
        for (const cell of grid.children) {
            const glyph = cell.querySelector(".glyph");
            const size = parseFloat(getComputedStyle(glyph).fontSize) || 14;
            // Half an em is nowhere near either outcome: a glyph is one em
            // wide, a name with no glyph is zero.
            const missing = glyph.getBoundingClientRect().width < size / 2;
            cell.classList.toggle("unresolved", missing);
            if (missing) {
                cell.title = `${cell.dataset.name} — listed by the server, but this font has no glyph for it`;
                unresolved += 1;
            }
        }
        return unresolved;
    }

    /** Fill and size changed: the cells stand, only their dress changes. */
    function redressGrid() {
        const byName = new Map(icons.map((icon) => [icon.name, icon]));
        for (const cell of grid.children) {
            dressCell(cell, byName.get(cell.dataset.name));
        }
    }

    // == Feedback ========================================================

    let toastTimer;

    function say(message, failed = false) {
        clearTimeout(toastTimer);
        toast.textContent = message;
        toast.classList.toggle("failed", failed);
        toast.classList.add("show");
        toastTimer = setTimeout(() => toast.classList.remove("show"), failed ? 6000 : 2000);
    }

    function count() {
        const withFill = icons.filter((icon) => icon.has_fill).length;
        countBadge.textContent = `${icons.length} · ${withFill} filled`;
        if (!icons.length) {
            status.textContent =
                "No icon matches — the font is a subset, so a name from the Material Symbols site may simply not be shipped.";
            return;
        }
        // Deliberately not awaited: the grid is already usable, and the font
        // may still be in flight. The run counter keeps a slow check from
        // reporting on a grid the next search has already replaced.
        const run = searchRun;
        checkGlyphs().then((unresolved) => {
            if (run !== searchRun) {
                return;
            }
            status.textContent = unresolved
                ? `${unresolved} listed here have no glyph in the loaded font — the list and the font come from different builds. Regenerate, and restart the server if it persists.`
                : "";
            status.classList.toggle("stale", Boolean(unresolved));
        });
    }

    // == Search ==========================================================

    let searchRun = 0;

    async function search() {
        const needle = searchInput.value.trim();
        const run = ++searchRun;
        try {
            if (!needle && allIcons) {
                icons = allIcons;
            } else {
                const rows = await searchAllTerms(needle);
                // Searches race: typing "cart" fires four of them and the
                // second can answer last. Only the latest gets to render.
                if (run !== searchRun) {
                    return;
                }
                icons = rows;
                if (!needle) {
                    allIcons = rows;
                }
            }
        } catch (error) {
            status.textContent = `Search failed: ${error.message}`;
            return;
        }
        status.textContent = "";
        renderGrid();
        count();
    }

    let searchTimer;
    searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(search, 200);
    });

    // == Copy ============================================================

    async function copy(text) {
        try {
            // navigator.clipboard only exists in a secure context, so it is
            // missing as soon as the server is reached by IP over plain HTTP
            // (--http-interface=0.0.0.0).
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch {
            // Falls through to the scratch textarea.
        }
        const scratch = document.createElement("textarea");
        scratch.value = text;
        scratch.style.cssText = "position:fixed;top:-1000px;opacity:0";
        document.body.append(scratch);
        scratch.select();
        let done = false;
        try {
            done = document.execCommand("copy");
        } catch {
            done = false;
        }
        scratch.remove();
        return done;
    }

    // == SVG =============================================================

    async function fetchSvg(icon) {
        // The variant has to follow what this build actually renders, not what
        // the switcher says: asking Google for the filled shape of an icon
        // whose shipped glyph has none hands back something the webclient
        // never draws.
        const response = await fetch(SVG_URL(icon.name, isFilled(icon) ? "fill1" : "default"));
        if (!response.ok) {
            throw new Error(`${response.status} from fonts.gstatic.com`);
        }
        return response.text();
    }

    async function withSvg(icon, action, what) {
        try {
            await action(await fetchSvg(icon));
        } catch (error) {
            say(`Could not get ${icon.name}.svg — ${error.message}. ${what} needs fonts.gstatic.com, which this host may not reach.`, true);
        }
    }

    // == Interaction =====================================================

    grid.addEventListener("click", (ev) => {
        const cell = ev.target.closest(".cell");
        if (!cell) {
            return;
        }
        const icon = icons.find((candidate) => candidate.name === cell.dataset.name);
        if (!icon) {
            return;
        }
        const action = ev.target.closest(".cell-action");

        if (action?.classList.contains("copy-svg")) {
            withSvg(icon, async (svg) => {
                say(await copy(svg) ? `Copied ${icon.name}.svg markup` : "Copy failed", false);
            }, "Copying the SVG");
            return;
        }
        if (action?.classList.contains("download-svg")) {
            withSvg(icon, (svg) => {
                const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
                const link = document.createElement("a");
                link.href = url;
                link.download = `${icon.name}${isFilled(icon) ? "_filled" : ""}.svg`;
                document.body.append(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(url);
                say(`Downloaded ${link.download}`);
            }, "Downloading the SVG");
            return;
        }

        const markup = markupFor(icon);
        cell.classList.add("copied");
        setTimeout(() => cell.classList.remove("copied"), 700);
        copy(markup).then((done) => say(done ? `Copied  ${markup}` : `Copy failed — ${markup}`, !done));
    });

    // == Switchers =======================================================

    /** Marks the clicked button of a `data-<group>` set as the active one. */
    function pick(group, value) {
        for (const btn of document.querySelectorAll(`[data-${group}]`)) {
            btn.classList.toggle("active", btn.dataset[group] === value);
        }
    }

    for (const btn of document.querySelectorAll("[data-fill]")) {
        btn.addEventListener("click", () => {
            filled = btn.dataset.fill === "1";
            pick("fill", btn.dataset.fill);
            redressGrid();
        });
    }

    /**
     * What goes stale is the compiled bundles: they are served from
     * ir.attachment at a versioned URL, and Odoo keeps serving the stored one
     * -- including, silently, the last good one when a stylesheet fails to
     * compile. The font itself does not: the page pulls it through
     * /web/assets/debug/, which rebuilds from source, and debug mode serves
     * static files with max-age 0.
     *
     * What this button cannot fix is web/icons.py: it is a Python module, read
     * once at server start, so a freshly generated list needs a restart. Hence
     * the message rather than a bare reload.
     */
    const regenerateButton = document.getElementById("regenerate");
    regenerateButton.addEventListener("click", async () => {
        regenerateButton.disabled = true;
        say("Dropping the compiled bundles…");
        try {
            await regenerateAssets();
        } catch (error) {
            regenerateButton.disabled = false;
            say(`Could not regenerate: ${error.message}`, true);
            return;
        }
        // The count is worth carrying across the reload: seeing it move is how
        // you know the wishlist change actually landed.
        sessionStorage.setItem("designerIconsBefore", String(icons.length));
        location.reload();
    });

    const step = (delta) => () => {
        sizeIndex = Math.min(SIZES.length - 1, Math.max(0, sizeIndex + delta));
        applySize();
    };
    document.getElementById("size-down").addEventListener("click", step(-1));
    document.getElementById("size-up").addEventListener("click", step(+1));

    // == Keyboard ========================================================

    document.addEventListener("keydown", (ev) => {
        if (ev.ctrlKey || ev.metaKey || ev.altKey) {
            return;
        }
        if (ev.key === "/" && ev.target !== searchInput) {
            ev.preventDefault();
            searchInput.focus();
            searchInput.select();
        } else if (ev.key === "Escape" && ev.target === searchInput) {
            searchInput.value = "";
            search();
        }
    });

    applySize();
    status.textContent = "Loading the icon list…";
    search().then(() => {
        const before = sessionStorage.getItem("designerIconsBefore");
        sessionStorage.removeItem("designerIconsBefore");
        if (before !== null) {
            const delta = icons.length - Number(before);
            say(
                delta
                    ? `Regenerated — ${icons.length} icons, ${delta > 0 ? "+" : ""}${delta} since before`
                    : `Regenerated — ${icons.length} icons, unchanged`
            );
        }
    });
}

// The page is the only caller. Guarded rather than trusted: this script is in
// no bundle today, but a glob that swallowed it would otherwise run it against
// the webclient DOM and take the module loader down with it.
if (document.getElementById("grid") && document.body.classList.contains("o_designer_icons")) {
    initIcons();
}
