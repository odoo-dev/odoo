import {
    useEnv,
    useExternalListener,
    useLayoutEffect,
    useRef,
    useSubEnv,
} from "@web/owl2/utils";
import { browser } from "@web/core/browser/browser";
const sessionStorage = browser.sessionStorage;
import { AutoComplete } from "@web/core/autocomplete/autocomplete";
import { delay } from "@web/core/utils/concurrency";
import { getDataURLFromFile, redirect } from "@web/core/utils/urls";
import { getCSSVariableValue } from "@html_editor/utils/formatting";
import { _t } from "@web/core/l10n/translation";
import { svgToPNG, webpToPNG } from "@website/js/utils";
import { escapeRegExp } from "@web/core/utils/strings";
import { useAutofocus, useService } from "@web/core/utils/hooks";
import { htmlSprintf } from "@web/core/utils/html";
import { clamp } from "@web/core/utils/numbers";
import { registry } from "@web/core/registry";
import { rpc } from "@web/core/network/rpc";
import { mixCssColors } from "@web/core/utils/colors";
import { router } from "@web/core/browser/router";
import {
    Component,
    markup,
    onMounted,
    onWillStart,
    proxy,
    useEffect,
    onWillUnmount,
    xml,
} from "@odoo/owl";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { fuzzyLevenshteinLookup } from "@web/core/utils/search";
import { isBrowserSafari } from "@web/core/browser/feature_detection";
import {
    adaptHighlightPosition,
    getCurrentTextHighlight,
    makeHighlightSvgs,
} from "@website/js/highlight_utils";
import {
    CURATED_STYLES,
    LAYOUTS,
    STYLE_CATEGORIES,
    USER_STYLE_COMBOS,
    VIBES,
} from "@website/client_actions/configurator/configurator_data";

export const ROUTES = {
    descriptionScreen: 2,
    styleSelectionScreen: 3,
    vibeSelectionScreen: 4,
    layoutSelectionScreen: 5,
    previewScreen: 7,            // 6 is reserved by website_enterprise (websiteGenerator)
};

export const WEBSITE_TYPES = {
    1: { id: 1, label: _t("a website"), name: "business" },
    2: { id: 2, label: _t("an eCommerce"), name: "eCommerce" },
    3: { id: 3, label: _t("a blog"), name: "blog" },
    4: { id: 4, label: _t("an event website"), name: "event" },
    5: { id: 5, label: _t("an elearning platform"), name: "elearning" },
};

export const WEBSITE_PURPOSES = {
    1: { id: 1, label: _t("get leads"), name: "get_leads" },
    2: { id: 2, label: _t("develop the brand"), name: "develop_brand" },
    3: { id: 3, label: _t("sell more"), name: "sell_more" },
    4: { id: 4, label: _t("inform customers"), name: "inform_customers" },
    5: { id: 5, label: _t("schedule appointments"), name: "schedule_appointments" },
};

// ── Preview scaling constants (match prototype step 4) ───────────────────────
const PREVIEW_FULL_WIDTH = 1280;
const PREVIEW_ASPECT_H = Math.round(PREVIEW_FULL_WIDTH * 2.5 / 2);

// Inline style for a 1280px-wide preview scaled to fit its container.
// Shared by the layout-selection grid and the single-preview step so both
// use the identical rendering approach.
function previewHostStyle(scale) {
    return [
        `width:${PREVIEW_FULL_WIDTH}px`,
        `height:${PREVIEW_ASPECT_H}px`,
        `transform:scale(${scale}) translateZ(1px)`,
        `transform-origin:top left`,
        `position:absolute`,
        `top:0`,
        `left:0`,
        `pointer-events:none`,
    ].join(";");
}

// ── Display-N typography tokens ───────────────────────────────────────────────
// Baseline applied to every style on website creation AND during preview.  Any
// CURATED_STYLES entry can override any subset of these by declaring keys with
// the exact SCSS variable name, e.g.:
//
//     { id: 'soft-04', ...,
//       'display-1-font-size': '3.5rem', 'display-1-line-height': '0.9' }
//
// font-size defaults are intentionally absent so Bootstrap's per-display sizes
// in bootstrap_overridden.scss keep applying when the style does not set one.
const DEFAULT_DISPLAY_TOKENS = Object.freeze({
    'display-1-line-height': '1.1',
    'display-2-line-height': '1.1',
    'display-3-line-height': '1.1',
    'display-4-line-height': '1.1',
    'display-5-line-height': '1.1',
    'display-6-line-height': '1.1',
});
const DISPLAY_TOKEN_OVERRIDABLE_KEYS = [
    ...Object.keys(DEFAULT_DISPLAY_TOKENS),
    'display-1-font-size', 'display-2-font-size', 'display-3-font-size',
    'display-4-font-size', 'display-5-font-size', 'display-6-font-size',
];

/**
 * Resolve the display-N tokens for one style: defaults overlaid with any keys
 * the style declared.  Returned dict is keyed by SCSS variable name so it can
 * be spread directly into make_scss_customization payloads.
 */
function getDisplayTokens(style) {
    const out = { ...DEFAULT_DISPLAY_TOKENS };
    for (const k of DISPLAY_TOKEN_OVERRIDABLE_KEYS) {
        if (style && style[k] != null) out[k] = style[k];
    }
    return out;
}

/**
 * Build the full SCSS customization payload for a given style.  Shared by both
 * preview-time customization calls (StyleSelectionScreen.selectStyle and
 * Configurator.onStyleChange) so the in-flight preview bundle and the final
 * persisted website stay in sync.  Returns a plain object suitable for
 * make_scss_customization's second argument.
 */
function buildStyleScssValues(style) {
    // User-generated styles have no named SCSS palette — they ride on the
    // generic 'base-1' palette while their actual colours are written to
    // user_color_palette.scss separately (see styleScssWrites).
    const paletteName = style.userGenerated ? "base-1" : style.id;
    return {
        "color-palettes-name": `'${paletteName}'`,
        "headings-font": `'${style.fontHead}'`,
        "font": `'${style.fontBody}'`,
        "btn-border-radius": style.radius,
        // Register the chosen fonts as Google fonts so that o-get-font-info()
        // can resolve them in the compiled bundle.  Without this the SCSS
        // lookup falls back to the theme default and the website renders in
        // Inter/Inter Tight instead of the curated typeface.
        "google-fonts": `('${style.fontHead}', '${style.fontBody}')`,
        ...getDisplayTokens(style),
    };
}

// ── User-generated (logo) styles ──────────────────────────────────────────────

/**
 * Derive a full 5-colour palette from the two colours extracted from the
 * user's logo.  Reuses the historical "recommended palette" formula so the
 * result is identical to the pre-refactor behaviour.
 *
 * @param {string} color1  primary colour (hex)
 * @param {string} color2  secondary colour (hex)
 * @returns {string[]}     [c1, c2, c3, c4, c5]
 */
function buildUserPaletteColors(color1, color2) {
    if (color1 && color1 === color2) {
        color2 = mixCssColors("#FFFFFF", color1, 0.2);
    }
    return [
        color1,
        color2,
        mixCssColors("#FFFFFF", color2, 0.9),
        "#FFFFFF",
        mixCssColors(color1, "#000000", 0.125),
    ];
}

/**
 * Build the four user-generated styles (USER_STYLE_COMBOS paired with the
 * logo-derived palette).  Returns [] when no palette has been extracted.
 *
 * @param {string[]|undefined} colors  [c1..c5] from buildUserPaletteColors
 * @returns {Array}
 */
function buildUserStyles(colors) {
    if (!colors || colors.length < 5) {
        return [];
    }
    return USER_STYLE_COMBOS.map((combo) => ({
        ...combo,
        colors,
        userGenerated: true,
        // VibeSelectionScreen paints nav/footer stripes from these; the logo
        // palette has no CC defaults so fall back to primary / dark.
        menuBg: colors[0],
        footerBg: colors[4],
    }));
}

/**
 * The full style list for a given store state: the 20 premade styles plus,
 * when a logo palette has been extracted, the 4 user-generated styles.
 *
 * @param {object} state  the configurator store
 * @returns {Array}
 */
function getAllStyles(state) {
    return readAllStyleTokens().concat(buildUserStyles(state && state.recommendedColors));
}

/**
 * The make_scss_customization writes needed to apply a style.  Named styles
 * need one write (user_values.scss); user-generated styles also need the
 * custom colour palette written to user_color_palette.scss.
 *
 * @param {object} style
 * @returns {Array<[string, object]>}  [ [scssPath, values], ... ]
 */
function styleScssWrites(style) {
    const writes = [[
        "/website/static/src/scss/options/user_values.scss",
        buildStyleScssValues(style),
    ]];
    if (style.userGenerated && style.colors) {
        const palette = {};
        style.colors.forEach((c, i) => { palette[`o-color-${i + 1}`] = c; });
        writes.push([
            "/website/static/src/scss/options/colors/user_color_palette.scss",
            palette,
        ]);
    }
    return writes;
}

// ── Shared CSS-token reader ───────────────────────────────────────────────────
// Both StyleSelectionScreen (step 3) and PreviewScreen (step 7) need the full
// set of per-style design tokens.  A single helper here ensures both callsites
// stay in sync and avoids duplicating the getComputedStyle scan.
//
// The result is NOT memoized: reloadBundles() changes the underlying CSS custom
// properties (the compiled bundle changes), so each component should call this
// once on setup/mount rather than sharing a stale module-level cache.

/**
 * Augment every CURATED_STYLES entry with the palette-derived values that
 * only exist as CSS custom properties (palette colours + menu/footer bg).
 * Font and radius tokens are now declared inline on each entry, so they
 * are passed through unchanged.
 *
 * CSS custom property values may come back with surrounding CSS string quotes
 * (e.g. `'#1A222B'`).  They are stripped before returning.
 *
 * @returns {Array}  CURATED_STYLES entries augmented with
 *                   {colors, menuBg, footerBg}.
 */
function readAllStyleTokens() {
    const cssStyle = window.getComputedStyle(document.documentElement);
    const strip = (val) => val.replace(/^['"]|['"]$/g, "");
    return CURATED_STYLES.map((entry) => {
        const colors = [1, 2, 3, 4, 5].map((i) =>
            strip(getCSSVariableValue(`o-palette-${entry.id}-o-color-${i}`, cssStyle))
        );
        // Resolved hex background colours for the palette's default menu (header)
        // and footer CC.  Used by VibeSelectionScreen to paint the nav/footer
        // stripes in the visual vibe preview.  These are palette-level defaults
        // and do NOT affect header/footer template choice (that now lives in the
        // layout XML via <ConfiguratorHeader> / <ConfiguratorFooter>).
        const menuBg = strip(
            getCSSVariableValue(`o-palette-${entry.id}-menu-bg`, cssStyle).trim()
        ) || "";
        const footerBg = strip(
            getCSSVariableValue(`o-palette-${entry.id}-footer-bg`, cssStyle).trim()
        ) || "";
        return { ...entry, colors, menuBg, footerBg };
    });
}

/**
 * Stores the in-flight make_scss_customization promise at module scope so it
 * is NOT wrapped in OWL's reactive Proxy (awaiting a proxied Promise can hang
 * because the Proxy may not forward .then() with the correct `this` binding).
 */
let _pendingStyleCustomization = null;
/**
 * Tracks whether the last make_scss_customization call has settled.
 * Starts as `true` (nothing pending).  Set to `false` when a new SCSS
 * compilation is kicked off and back to `true` when it resolves/rejects.
 * This lets LayoutSelectionScreen.setup() check synchronously whether it
 * is safe to skip the loading spinner, even though the Promise itself
 * remains non-null after resolution.
 */
let _pendingStyleCustomizationDone = true;
/**
 * Whether the website CSS bundle has been loaded at least once via
 * reloadBundles().  Starts as `false`; set to `true` once the bundle
 * swap completes.
 *
 * LayoutSelectionScreen uses this to decide whether it can render cards
 * immediately (skipLoader).  If the bundle hasn't been loaded yet, cards
 * would appear with wrong fonts / colours until the bundle arrives, causing
 * a visible flicker.
 */
let _bundleReloadDone = false;
/**
 * Shared in-flight Promise for an ongoing reloadBundles() call that was
 * proactively started (from StyleSelectionScreen.selectStyle) as soon as
 * SCSS compilation finished.  LayoutSelectionScreen.bundleChain awaits
 * this instead of issuing a second parallel reloadBundles() call.
 * Set to null when the promise settles.
 */
let _pendingBundleReload = null;

// ── Early-prefetch cache ──────────────────────────────────────────────────────
// Populated as soon as the industry is selected (Step 2), so by the time the
// user reaches Step 4 (vibe) and Step 5 (layout) the round-trips are already
// in-flight (or resolved) and images are browser-cached.
//
// Stored at module scope (NOT in OWL reactive state) for the same reason as
// _pendingStyleCustomization — to avoid Proxy wrapping breaking Promise chains.
//
// Keyed by `${vibe}:${industryId ?? 'null'}` so that multiple vibes can be
// cached simultaneously (e.g. "clean" is pre-fetched at industry-selection and
// any other vibe is pre-fetched the moment the user clicks it in Step 4).
//
// Each value has shape:
//   { industryId: number|null, vibe: string,
//     promise: Promise<object>,
//     result: object|undefined }   // set synchronously once the promise resolves
const _prefetchedPreviews = new Map();

/** Stable cache key for a (vibe, industryId) pair. */
function _previewCacheKey(vibe, industryId) {
    return `${vibe}:${industryId ?? "null"}`;
}
// Shape: { industryId: number|null, promise: Promise<string|null> }
let _prefetchedBanner = null;
// Shape: {
//   industryId:  number|null,
//   positioning: string,
//   promise:     Promise<object>,  // { "Original text" → "Adapted text" }
//   result:      object|undefined, // filled synchronously once promise settles
// }
let _prefetchedHeadings = null;
// Supplemental heading adaptations for vibes that change the heading text.
// Map<cacheKey, entry> where cacheKey = `${vibeId}:${industryId ?? "null"}:${positioning}`
// Each entry has the same shape as _prefetchedHeadings entries.
const _prefetchedVibeHeadings = new Map();

// ── Illustrative-SVG prefetch ─────────────────────────────────────────────────
// These 6 SVG files are the same regardless of industry or style, so they can
// be fetched the moment the Configurator component first mounts (step 1), well
// before the user reaches the Vibe selection screen (step 4).
//
// We store raw text (no fill-colour substitution yet), because the fill colours
// depend on the style palette the user picks in step 3.  Colour substitution
// is applied in VibeSelectionScreen._loadIllustrativeSvgs() once we know them.
//
// Shape: {
//   promise: Promise<Map<filename, rawText|null>>,
//   result:  Map<filename, rawText|null> | undefined  // filled on settlement
// }
let _prefetchedIllusSvgs = null;

const ILLUS_SVG_BASE = '/website/static/src/img/configurator';

const ILLUS_SVG_FILES = [
    '3-50-50.svg', '1-35-25.svg', '1-80-75.svg',
    '2-25-75.svg', '2-60-30.svg', '5-60-70.svg',
];

/**
 * Start fetching the raw SVG text for every illustrative illustration file in
 * parallel.  Idempotent — calling it more than once is a no-op.
 *
 * Called from Configurator.setup() so the round-trips begin at Step 1,
 * long before the user reaches the Vibe selection screen (Step 4).
 */
function prefetchIllustrativeSvgs() {
    if (_prefetchedIllusSvgs) return; // already in-flight or resolved
    const entry = { promise: null, result: undefined };
    entry.promise = Promise.all(
        ILLUS_SVG_FILES.map((f) =>
            fetch(`${ILLUS_SVG_BASE}/${f}`)
                .then((r) => r.text())
                .catch(() => null)
        )
    ).then((texts) => {
        const map = new Map(ILLUS_SVG_FILES.map((f, i) => [f, texts[i]]));
        entry.result = map;
        return map;
    }).catch(() => {
        entry.result = new Map();
    });
    _prefetchedIllusSvgs = entry;
}

/**
 * Holds strong references to Image objects created in preloadImagesFromPreviews
 * so the GC does NOT collect them (and evict the decoded bitmaps from memory)
 * before LayoutSelectionScreen renders.  Cleared once the layout screen mounts.
 */
const _preloadedImageRefs = [];

// ── Industry image showcase ───────────────────────────────────────────────────
// Each of the 9 template slots maps to a fixed image *record key*. The <img>
// is always rendered; the slot reveals (o_cfg_slot_fetched class) once its
// image has decoded. When an industry is selected the slot's record is
// swapped to its IAP industry-specific URL (keys chosen from the
// IAP-substituted s_*_default_image family); it falls back to the default
// /web/image/website.<key> when no industry / no substitution.
// Sizing/shadow/float-animation are hardcoded per slot in the template +
// configurator.scss (.o_cfg_slot_N).
const SHOWCASE_SLOT_KEYS = [
    "website.s_banner_default_image",
    "website.s_cover_default_image",
    "website.s_image_text_default_image",
    "website.s_text_image_default_image",
    "website.s_picture_default_image",
    "website.s_product_list_default_image_1",
    "website.s_media_list_default_image_1",
    "website.s_carousel_default_image_1",
    "website.s_showcase_default_image",
];

const showcaseDefaultUrl = (key) => `/web/image/${key}`;

// Stored as { slots: {} } so OWL tracks each slot key reactively; each slot
// is { url, fetched } — `fetched` flips true once the image has decoded.
const _showcaseImages = proxy({ slots: {} });

// Strong refs so the GC does not evict the decoded bitmaps before render.
const _showcaseImageRefs = [];

// Tracks the industry the slots currently reflect, so a stale RPC response
// (industry changed again before it resolved) is ignored.
let _showcaseIndustryId = null;

// Populate the slots synchronously so every <img> renders immediately
// (hidden until its `fetched` flag flips). Idempotent.
function initShowcaseSlots() {
    if (Object.keys(_showcaseImages.slots).length) return;
    SHOWCASE_SLOT_KEYS.forEach((key, i) => {
        _showcaseImages.slots[i] = { url: showcaseDefaultUrl(key), fetched: false };
    });
}

// (Re)load one slot's image: hide it, swap the URL, decode, then reveal.
function _loadShowcaseSlot(i, url) {
    const slot = _showcaseImages.slots[i];
    if (slot.url === url && slot.fetched) return; // already showing this image
    slot.fetched = false;
    slot.url = url;
    const img = new Image();
    img.src = url;
    _showcaseImageRefs.push(img);
    img.decode()
        .then(() => {
            // Ignore if the slot's target changed while decoding.
            if (_showcaseImages.slots[i].url === url) {
                _showcaseImages.slots[i].fetched = true;
            }
        })
        .catch(() => {});
}

// Hide the whole showcase (no slots rendered).
function clearShowcaseImages() {
    _showcaseImages.slots = {};
    _showcaseIndustryId = null;
}

// Show the showcase ONLY for a valid industry (a real record, id > 0).
// An empty field or an unknown industry (the autocomplete "no result" entry
// has id -1) clears it — no default images are shown in those cases.
async function updateShowcaseForIndustry(industryId) {
    const validId = Number.isInteger(industryId) && industryId > 0;
    if (!validId) {
        clearShowcaseImages();
        return;
    }
    _showcaseIndustryId = industryId;
    initShowcaseSlots();
    let images = {};
    try {
        images = await rpc("/website/configurator/get_industry_images", {
            industry_id: industryId,
        });
    } catch {
        images = {};
    }
    if (_showcaseIndustryId !== industryId) return; // industry changed meanwhile
    SHOWCASE_SLOT_KEYS.forEach((key, i) =>
        _loadShowcaseSlot(i, images[key] || showcaseDefaultUrl(key))
    );
}

// ── Shadow DOM preview registry ───────────────────────────────────────────────
// Every LayoutPreviewHost registers its shadow root here on mount and removes
// it on unmount.  reloadBundles() pushes new bundle CSS into each one so the
// previews always reflect the currently-compiled style.
const _previewShadowRoots = new Set();

// Most recently loaded website bundle href URLs.  Injected into new shadow
// roots at mount time so they immediately pick up the current palette / fonts.
let _currentBundleHrefs = [];

// Google Fonts href built by loadStyleFonts().  Kept here so that any shadow
// root created after the fonts have been loaded can still get a <link> for them
// (CSS — including @font-face — does not cross shadow boundaries).
let _currentStyleFontsHref = null;

// The fontHead / fontBody of the currently-selected style.  Injected as an
// explicit override <style> into every shadow root so headings and body text
// actually render with the chosen typefaces regardless of how the compiled
// bundle exposes them.
let _currentStyleFonts = null; // { fontHead: string, fontBody: string } | null

// Id of the currently-selected style.  Used as a stable cache-buster key for
// palette-baked shape SVG URLs so that revisiting a style hits the browser HTTP
// cache (and the server-side SVG cache) instead of re-rendering identical SVGs.
let _currentStyleId = null;

// ── Per-shadow-root normalisation CSS ────────────────────────────────────────
// These rules must live INSIDE each shadow root because CSS from the main
// document cannot cross shadow boundaries.  They replace the light-DOM rules
// that were previously in .o_layout_preview_wrapper in configurator.scss.
const PREVIEW_SHADOW_STYLES = `
    [data-aos] {
        opacity: 1 !important;
        transform: none !important;
        transition: none !important;
    }
    [data-wow-delay], [class*='wow'] {
        visibility: visible !important;
        opacity: 1 !important;
        animation: none !important;
    }
    * {
        content-visibility: visible !important;
        animation-delay: 0s !important;
    }
    section {
        position: relative !important;
    }
    .s_parallax_bg_wrap,
    .s_parallax_bg {
        display: block !important;
        position: absolute !important;
        top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
        background-size: cover !important;
    }
    
    /* Typography: provide a preview, actual values will be used on website creation */
    h1 strong, h2 strong, h3 strong, h4 strong, h5 strong, h6 strong  {
        font-weight: 800;
    }
    h6, .h6, h5, .h5, h4, .h4, h3, .h3, h2, .h2, h1, .h1, .s_announcement_scroll_marquee_item {
        font-family: var(--o-heading-font-family) !important;
    }
    
    .btn-outline-primary, .btn-outline-secondary  {
        --btn-border-width: 2px !important;
    }
    
    header#top {
        background: transparent !important;
    }
    header#top .navbar,
    header#top .navbar-light .nav {
        --o-cc-bg: inherit;
        --o-cc-text: inherit;
        --nav-link-color: var(--o-cc-text);
        --navbar-color: inherit;
        position: relative !important;
        opacity: 1 !important;
    }
    .container {
        max-width: 1140px !important;
    }
    /* Hide mobile header in preview (show desktop only) */
    .o_header_mobile {
        display: none !important;
    }
    /* Hide the configurator meta elements if QWeb rendered them into the body */
    configuratorheader, configuratorfooter {
        display: none !important;
    }
`;


/**
 * Normalise a layout-preview HTML string before injecting it into a Shadow DOM
 * root.  Converts lazysizes / native-lazy attributes to eager loading so images
 * appear immediately inside the static scaled card.
 *
 * Parallax classes are NOT stripped: the parallax JS uses `document.querySelectorAll`
 * which cannot cross shadow boundaries, so it never activates on preview content.
 * The `.s_parallax_bg_wrap` sizing rules are injected directly into each shadow
 * root via PREVIEW_SHADOW_STYLES.
 *
 * @param {string} html  Raw server-rendered HTML string
 * @returns {string}
 */
function normalizePreviewHtml(html) {
    if (!html) return html;
    return html
        // lazysizes src:  data-src="…"     → src="…"
        .replace(/\bdata-src=/g, "src=")
        // lazysizes srcset: data-srcset="…" → srcset="…"
        .replace(/\bdata-srcset=/g, "srcset=")
        // native lazy: loading="lazy"       → loading="eager"
        .replace(/\bloading="lazy"/g, 'loading="eager"')
        // lazysizes bg: data-bg="url"       → inline style
        // URL is single-quoted so that paths containing parentheses, spaces, or
        // other special characters remain valid CSS.
        .replace(/\bdata-bg="([^"]+)"/g, (_m, url) => `style="background-image:url('${url}')"`)

        // Replace lazysizes class so `.lazyload { opacity: 0 }` never hides images.
        .replace(/\blazyload\b/g, "lazyloaded");
}

// Defensive so old/fallback responses (plain strings) also work.
function extractPreviewHtml(entry) {
    if (!entry) return "";
    if (typeof entry === "string") return entry;
    return entry.html || "";
}

/**
 * Extract the layout config (header/footer template + color-combination indices)
 * from a preview entry.  Falls back to minimal defaults when absent.
 *
 * @param {object|string} entry
 * @returns {{ headerTemplate: string, footerTemplate: string, headerCc: number, footerCc: number, headerOverlay: boolean, headerFullWidth: boolean }}
 */
function extractLayoutConfig(entry) {
    if (!entry || typeof entry === "string") {
        return {
            headerTemplate: "template_header_default",
            footerTemplate: "footer_custom",
            headerCc: 1,
            footerCc: 2,
            headerOverlay: false,
            headerFullWidth: false,
            headerBg: "",
            headerBorder: "",
            headerShadow: "",
            headerTextColor: "",
            footerBg: "",
        };
    }
    return {
        headerTemplate: entry.headerTemplate || "template_header_default",
        footerTemplate: entry.footerTemplate || "footer_custom",
        headerCc: entry.headerCc || 1,
        footerCc: entry.footerCc || 2,
        headerOverlay: entry.headerOverlay || false,
        headerFullWidth: entry.headerFullWidth || false,
        // Hardcoded header/footer style overrides (CSS strings; "" = unset).
        headerBg: entry.headerBg || "",
        headerBorder: entry.headerBorder || "",
        headerShadow: entry.headerShadow || "",
        headerTextColor: entry.headerTextColor || "",
        footerBg: entry.footerBg || "",
    };
}

/**
 * Extract all image URLs from an object of layout HTML strings and fire
 * off background Image fetches + decode() calls so the browser has the
 * bitmaps ready before the layout cards are rendered.
 *
 * @param {object} previews  Map of layoutId → preview entry (object or string)
 */
function preloadImagesFromPreviews(previews) {
    const urls = new Set();
    const imgSrcRe = /\b(?:data-)?src=["']([^"']+)["']/g;
    const srcsetRe = /\b(?:data-)?srcset=["']([^\s"',]+)/g;
    const bgUrlRe  = /url\((?:&#39;|["'])?([^)"'&#\s]+)(?:&#39;|["'])?\)/g;

    for (const entry of Object.values(previews)) {
        const html = extractPreviewHtml(entry);
        if (!html) continue;
        let m;
        while ((m = imgSrcRe.exec(html)) !== null) urls.add(m[1]);
        imgSrcRe.lastIndex = 0;
        while ((m = srcsetRe.exec(html)) !== null) urls.add(m[1]);
        srcsetRe.lastIndex = 0;
        while ((m = bgUrlRe.exec(html)) !== null) urls.add(m[1]);
        bgUrlRe.lastIndex = 0;
    }

    for (const url of urls) {
        if (!url.startsWith("https://") && !url.startsWith("/web/image")) continue;
        const img = new Image();
        img.src = url;
        _preloadedImageRefs.push(img);
        // decode() forces off-thread bitmap decode so the GPU has the image
        // ready before LayoutSelectionScreen paints.
        img.decode().catch(() => {});
    }
}

/**
 * Kick off a background fetch of all layout preview HTML for the given
 * industry and vibe.  Defaults to "clean" (called right after industry
 * selection); also called with the user's chosen vibe when they select one
 * in VibeSelectionScreen so non-clean vibes benefit from the same
 * zero-latency fast-path as "clean".
 *
 * Idempotent: calling it a second time for the same (vibe, industry) pair is
 * a safe no-op — the in-flight or resolved entry is reused.
 *
 * The resolved value is captured synchronously in `.result` so that
 * LayoutSelectionScreen can check at setup() time whether data is already
 * available without having to await anything.
 *
 * @param {number|null} industryId
 * @param {string}      [vibe="clean"]
 */
function prefetchLayoutPreviews(industryId, vibe = "clean") {
    const key = _previewCacheKey(vibe, industryId);
    if (_prefetchedPreviews.has(key)) return; // already in-flight or resolved

    const entry = {
        industryId,
        vibe,
        result: undefined,   // will be filled when the promise settles
        promise: null,
    };
    entry.promise = rpc("/website/configurator/get_layout_previews", {
        vibe,
        industry_id: industryId,
    });
    // Capture the result, pre-warm the browser image cache AND pre-normalize
    // the HTML strings so that by the time LayoutSelectionScreen.setup() runs
    // the data is fully ready — just needs markup() wrapping, no further
    // string processing.  Preloading uses the RAW result (contains data-src=
    // attributes) before normalization converts them to src=, so the regex in
    // preloadImagesFromPreviews still finds the URLs.
    entry.promise
        .then((result) => {
            // 1. Pre-warm image cache (must run on raw HTML with data-src present)
            preloadImagesFromPreviews(result);
            // 2. Normalize each layout's HTML; preserve config alongside it.
            // entry.result maps layoutId → { html (normalised string), + config fields }
            const normalized = {};
            for (const [k, v] of Object.entries(result)) {
                const rawHtml = extractPreviewHtml(v);
                const config = extractLayoutConfig(v);
                normalized[k] = {
                    ...config,
                    html: rawHtml ? normalizePreviewHtml(rawHtml) : "",
                };
            }
            entry.result = normalized;
        })
        .catch(() => {});
    _prefetchedPreviews.set(key, entry);
}

// Background fetch of the industry hero-banner URL.
function prefetchIndustryBanner(industryId) {
    _prefetchedBanner = {
        industryId,
        promise: rpc("/website/configurator/get_industry_banner", {
            industry_id: industryId,
        }),
    };
}

// Cached layout-previews Promise for vibe+industry, or null (caller must fetch).
function getCachedLayoutPreviews(vibe, industryId) {
    const entry = _prefetchedPreviews.get(_previewCacheKey(vibe, industryId));
    return entry ? entry.promise : null;
}

/**
 * Return the already-resolved preview data if the prefetch for the given
 * vibe+industry has settled, otherwise return null.
 * This allows LayoutSelectionScreen.setup() to skip the loading spinner
 * entirely when the data is already in hand.
 *
 * @param {string}      vibe
 * @param {number|null} industryId
 * @returns {object|null}
 */
function getResolvedLayoutPreviews(vibe, industryId) {
    const entry = _prefetchedPreviews.get(_previewCacheKey(vibe, industryId));
    if (entry && entry.result !== undefined) return entry.result;
    return null;
}

// Cached banner Promise for the requested industry, or null.
function getCachedBanner(industryId) {
    if (_prefetchedBanner && _prefetchedBanner.industryId === industryId) {
        return _prefetchedBanner.promise;
    }
    return null;
}

// ── Industry-adapted headings cache ──────────────────────────────────────────

/**
 * Extract unique plain-text content from every h1–h4 element across a map of
 * layout HTML strings.  Used to build the prompt sent to the AI for heading
 * adaptation.
 *
 * @param {object} previews  { layoutId → preview entry (object or string) }
 * @returns {string[]}
 */
function extractHeadingsFromPreviews(previews) {
    const texts = new Set();
    // Group 1 = tag name; backreference \1 ensures the closing tag matches the
    // opening tag
    // Group 2 = inner HTML content.
    const headingRe = /<(h[1-4])[^>]*>([\s\S]*?)<\/\1>/gi;
    // Marquee announcement items — the text they contain is displayed
    // prominently as a scrolling banner and should be adapted like headings.
    const marqueeRe = /<[^>]+class="[^"]*s_announcement_scroll_marquee_item[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi;
    // Strip SVG blocks first so opaque path data / coordinates are not included
    // in the plain-text key, then remove remaining tags.
    const stripTags = (s) =>
        s.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "")
         .replace(/<[^>]+>/g, "")
         .replace(/\s+/g, " ")
         .trim();
    for (const entry of Object.values(previews)) {
        const html = extractPreviewHtml(entry);
        if (!html) continue;
        let m;
        while ((m = headingRe.exec(html)) !== null) {
            const text = stripTags(m[2]); // m[2]: inner content (m[1] is the tag name)
            if (text) texts.add(text);
        }
        headingRe.lastIndex = 0;
        while ((m = marqueeRe.exec(html)) !== null) {
            const text = stripTags(m[1]);
            if (text) texts.add(text);
        }
        marqueeRe.lastIndex = 0;
    }
    return [...texts];
}

/**
 * Inject `adaptedText` (plain words) into the inner HTML of a heading or
 * marquee item while leaving all element nodes (decorative tags, SVG
 * highlights, etc.) completely untouched.
 *
 * Algorithm:
 *  1. Parse the inner HTML with DOMParser so we have a real node tree.
 *  2. Walk every text node that is NOT a descendant of an <svg> element.
 *  3. Separate whitespace-only nodes (kept as-is) from "meaningful" ones.
 *  4. Distribute the adapted words proportionally across the meaningful
 *     nodes (by original word count); the last node absorbs any remainder.
 *  5. Serialise back via innerHTML.
 *
 * @param {string} innerHtml   The raw inner HTML of the element.
 * @param {string} adaptedText The plain-text replacement (space-separated words).
 * @returns {string}
 */
function _injectAdaptedText(innerHtml, adaptedText) {
    // Fast path: plain-text heading (no inner tags, no SVG decoration).  The
    // common case — most h1–h6 contents have no child elements.  Avoids the
    // DOMParser + TreeWalker round-trip entirely; whitespace is preserved so
    // surrounding markup isn't disturbed.
    if (!innerHtml.includes("<")) {
        const leadWS = innerHtml.match(/^\s*/)[0];
        const trailWS = innerHtml.match(/\s*$/)[0];
        return leadWS + adaptedText.trim() + trailWS;
    }
    const doc = new DOMParser().parseFromString(`<div>${innerHtml}</div>`, "text/html");
    const root = doc.body.firstElementChild;

    // Collect text nodes that are NOT inside <svg> elements.
    const textNodes = [];
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        let ancestor = node.parentElement;
        let inSvg = false;
        while (ancestor && ancestor !== root) {
            if (ancestor.tagName === "SVG") { inSvg = true; break; }
            ancestor = ancestor.parentElement;
        }
        if (!inSvg) textNodes.push(node);
    }

    // Only operate on nodes that carry visible words.
    const meaningful = textNodes.filter((n) => n.textContent.trim() !== "");
    if (!meaningful.length) return innerHtml;

    const adaptedWords = adaptedText.trim().split(/\s+/);
    if (!adaptedWords.length) return innerHtml;

    const originalWordCounts = meaningful.map((n) => n.textContent.trim().split(/\s+/).length);
    const totalOriginalWords = originalWordCounts.reduce((s, c) => s + c, 0);

    let wordIndex = 0;
    for (let i = 0; i < meaningful.length; i++) {
        let share;
        if (i === meaningful.length - 1) {
            // Last node absorbs any remaining words.
            share = adaptedWords.slice(wordIndex);
        } else {
            const allotted = Math.max(
                1,
                Math.round((originalWordCounts[i] / totalOriginalWords) * adaptedWords.length)
            );
            // Guarantee at least one word remains for every subsequent node.
            const remainingWords = adaptedWords.length - wordIndex;
            const remainingNodes = meaningful.length - i;
            const safeAllotted = Math.min(allotted, remainingWords - (remainingNodes - 1));
            share = adaptedWords.slice(wordIndex, wordIndex + safeAllotted);
            wordIndex += share.length;
        }
        // Preserve the original node's leading and trailing whitespace so that
        // spacing between sibling elements (e.g. a text node ending with " "
        // before a <span>) is not lost when the words are replaced.
        const orig = meaningful[i].textContent;
        const leadWS = orig.match(/^\s*/)[0];
        const trailWS = orig.match(/\s*$/)[0];
        meaningful[i].textContent = leadWS + share.join(" ") + trailWS;
    }

    // Remove stale highlight SVGs so the TextHighlight interaction regenerates
    // them with dimensions matching the new text when the element is rendered.
    // Keeping the old path would leave the decoration over- or under-sized.
    root.querySelectorAll(".o_text_highlight_svg").forEach((svg) => svg.remove());

    return root.innerHTML;
}

/**
 * Apply a heading-adaptation map to an HTML string.  Each h1–h6 and marquee
 * item whose stripped inner text (SVG blocks excluded) appears as a key in
 * `headingMap` has its visible words replaced with the AI-adapted value while
 * ALL inner element nodes — <em>, <strong>, <span> highlights, <svg>
 * decorations, etc. — are preserved exactly as-is.
 *
 * @param {string} html        Raw or normalised HTML string.
 * @param {object} headingMap  { "Original plain text" → "Adapted plain text" }
 * @returns {string}
 */
function applyAdaptedHeadings(html, headingMap) {
    if (!html || !headingMap || !Object.keys(headingMap).length) return html;
    // Strip SVG blocks first so path data does not pollute the plain-text key.
    const toPlain = (s) =>
        s.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "")
         .replace(/<[^>]+>/g, "")
         .replace(/\s+/g, " ")
         .trim();
    // Rewrite h1–h6 elements preserving inner tags.
    let result = html.replace(/<(h[1-6])([^>]*?)>([\s\S]*?)<\/\1>/gi, (match, tag, attrs, inner) => {
        const adapted = headingMap[toPlain(inner)];
        if (!adapted) return match;
        return `<${tag}${attrs}>${_injectAdaptedText(inner, adapted)}</${tag}>`;
    });
    // Rewrite .s_announcement_scroll_marquee_item elements preserving inner tags.
    result = result.replace(
        /(<[^>]+class="[^"]*s_announcement_scroll_marquee_item[^"]*"[^>]*>)([\s\S]*?)(<\/[^>]+>)/gi,
        (match, openTag, inner, closeTag) => {
            const adapted = headingMap[toPlain(inner)];
            return adapted ? `${openTag}${_injectAdaptedText(inner, adapted)}${closeTag}` : match;
        }
    );
    return result;
}

/**
 * Kick off a background AI call to produce industry+positioning-adapted
 * headings for all layout previews.  Piggy-backs on the already in-flight
 * layout-previews prefetch to extract the source heading strings without an
 * extra round-trip.
 *
 * Called as soon as the user picks a positioning (Step 2) so the result is
 * ready — or very nearly so — by the time the Layout (Step 5) and Preview
 * (Step 7) screens mount.
 *
 * @param {string}      industryLabel  e.g. "Hair Salon"
 * @param {string}      positioning    e.g. "premium"
 * @param {number|null} industryId
 */
function prefetchAdaptedHeadings(industryLabel, positioning, industryId) {
    // Reuse the already in-flight (or resolved) layout-previews promise so we
    // don't fire an extra network request just to get the source headings.
    // Headings are always extracted from the "clean" vibe previews — layout
    // content (and therefore headings) is vibe-independent.
    const previewsSource =
        getCachedLayoutPreviews("clean", industryId) ||
        rpc("/website/configurator/get_layout_previews", {
            vibe: "clean",
            industry_id: industryId,
        });

    const entry = {
        industryId,
        positioning,
        result: undefined,
        promise: previewsSource
            .then(async (previews) => {
                const headings = extractHeadingsFromPreviews(previews);
                if (!headings.length) return {};
                const prompt =
                    `I am building a ${positioning} website for a ${industryLabel} business.\n` +
                    `Adapt the following heading texts to match the industry and positioning.\n` +
                    `CRITICAL: Each adapted string must be within 20% of the original character length (±20%).\n` +
                    `Keep the tone very close to the originals.\n` +
                    `Return ONLY a valid JSON object mapping each original string to its adapted version.\n` +
                    `No explanation, no markdown fences.\n\n` +
                    JSON.stringify(headings);
                const response = await rpc("/html_editor/generate_text", {
                    prompt,
                    conversation_history: [],
                });
                const match = response?.match(/\{[\s\S]*}/);
                const parsed = match && JSON.parse(match[0]);
                return parsed && typeof parsed === "object" ? parsed : {};
            })
            .catch(() => ({})),
    };
    entry.promise.then((result) => { entry.result = result; }).catch(() => { entry.result = {}; });
    _prefetchedHeadings = entry;
}

function getCachedHeadings(industryId, positioning) {
    if (
        _prefetchedHeadings &&
        _prefetchedHeadings.industryId === industryId &&
        _prefetchedHeadings.positioning === positioning
    ) {
        return _prefetchedHeadings.promise;
    }
    return null;
}

// Synchronously returns the resolved heading map only if the prefetch already
// settled, else null — lets callers skip the async path entirely.
function getResolvedHeadings(industryId, positioning) {
    if (
        _prefetchedHeadings &&
        _prefetchedHeadings.industryId === industryId &&
        _prefetchedHeadings.positioning === positioning &&
        _prefetchedHeadings.result !== undefined
    ) {
        return _prefetchedHeadings.result;
    }
    return null;
}

// ── Vibe-specific supplemental heading adaptations ────────────────────────────

function _vibeHeadingsCacheKey(vibeId, industryId, positioning) {
    return `${vibeId}:${industryId ?? "null"}:${positioning}`;
}

/**
 * Scan a single HTML string for h1–h4 / marquee-item plain texts that are
 * NOT present as keys in `headingMap`.  These are headings whose text the
 * vibe's xpath has changed relative to the "clean" baseline.
 *
 * Uses the same SVG-stripping + tag-stripping logic as
 * extractHeadingsFromPreviews so that keys are comparable.
 *
 * @param {string} vibeHtml   Raw HTML of a single layout preview.
 * @param {object} headingMap { "Original plain text" → "Adapted plain text" }
 * @returns {string[]}        Unique plain-text strings not yet in headingMap.
 */
function findUnmatchedHeadings(vibeHtml, headingMap) {
    if (!vibeHtml) return [];
    const headingRe = /<(h[1-4])[^>]*>([\s\S]*?)<\/\1>/gi;
    const marqueeRe = /<[^>]+class="[^"]*s_announcement_scroll_marquee_item[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi;
    const toPlain = (s) =>
        s.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "")
         .replace(/<[^>]+>/g, "")
         .replace(/\s+/g, " ")
         .trim();
    const unmatched = new Set();
    let m;
    while ((m = headingRe.exec(vibeHtml)) !== null) {
        const text = toPlain(m[2]);
        if (text && !headingMap[text]) unmatched.add(text);
    }
    while ((m = marqueeRe.exec(vibeHtml)) !== null) {
        const text = toPlain(m[1]);
        if (text && !headingMap[text]) unmatched.add(text);
    }
    return [...unmatched];
}

/**
 * Fire a supplemental AI call to adapt `missingTexts` for a specific vibe
 * whose xpath has changed some heading words relative to the "clean" baseline.
 * Result is stored in `_prefetchedVibeHeadings` under a key that includes the
 * vibe so the base cache is never polluted.
 *
 * Idempotent: a second call for the same (vibeId, industryId, positioning)
 * triple is a no-op.
 *
 * @param {string}      vibeId
 * @param {number|null} industryId
 * @param {string}      positioning
 * @param {string[]}    missingTexts  Plain-text strings not in the base headingMap.
 * @param {string}      industryLabel e.g. "Hair Salon"
 */
function prefetchVibeHeadings(vibeId, industryId, positioning, missingTexts, industryLabel) {
    const key = _vibeHeadingsCacheKey(vibeId, industryId, positioning);
    if (_prefetchedVibeHeadings.has(key)) return; // already in-flight or resolved
    if (!missingTexts.length) return;

    const entry = {
        vibeId,
        industryId,
        positioning,
        result: undefined,
        promise: (async () => {
            const label = industryLabel || "business";
            const prompt =
                `I am building a ${positioning} website for a ${label} business.\n` +
                `Adapt the following heading texts to match the industry and positioning. ` +
                `Keep the length and tone very close to the originals.\n` +
                `Return ONLY a valid JSON object mapping each original string to its adapted version. ` +
                `No explanation, no markdown fences.\n\n` +
                JSON.stringify(missingTexts);
            const response = await rpc("/html_editor/generate_text", {
                prompt,
                conversation_history: [],
            });
            const match = response?.match(/\{[\s\S]*}/);
            const parsed = match && JSON.parse(match[0]);
            return parsed && typeof parsed === "object" ? parsed : {};
        })().catch(() => ({})),
    };
    entry.promise.then((result) => { entry.result = result; }).catch(() => { entry.result = {}; });
    _prefetchedVibeHeadings.set(key, entry);
}

/**
 * Warm the layout-previews and vibe-headings caches for a single vibe.
 * Idempotent: relies on the underlying prefetch helpers for de-duplication so
 * it is safe to call from several places (positioning select, vibe-screen
 * mount, vibe click).  Decoration-only vibes produce an empty `missing` set
 * and cost zero AI calls.
 *
 * @param {string}      vibeId
 * @param {number|null} industryId
 * @param {string}      positioning
 * @param {string}      industryLabel
 */
async function prefetchVibeAssets(vibeId, industryId, positioning, industryLabel) {
    prefetchLayoutPreviews(industryId, vibeId);
    if (vibeId === "clean") return;
    const previews$ = getCachedLayoutPreviews(vibeId, industryId);
    const headings$ = getCachedHeadings(industryId, positioning);
    if (!previews$ || !headings$) return;
    try {
        const [previews, baseHeadingMap] = await Promise.all([previews$, headings$]);
        const missing = new Set();
        for (const entry of Object.values(previews)) {
            const html = extractPreviewHtml(entry);
            if (!html) continue;
            for (const t of findUnmatchedHeadings(html, baseHeadingMap)) {
                missing.add(t);
            }
        }
        if (missing.size) {
            prefetchVibeHeadings(vibeId, industryId, positioning, [...missing], industryLabel);
        }
    } catch (_e) { /* prefetch is best-effort */ }
}

function prefetchAllVibeAssets(industryId, positioning, industryLabel) {
    for (const vibe of VIBES) {
        prefetchVibeAssets(vibe.id, industryId, positioning, industryLabel);
    }
}

function getCachedVibeHeadings(vibeId, industryId, positioning) {
    const entry = _prefetchedVibeHeadings.get(_vibeHeadingsCacheKey(vibeId, industryId, positioning));
    return entry ? entry.promise : null;
}

// ── Configurator font loading ─────────────────────────────────────────────────
// We inject <link> tags on first use instead of @import url() in SCSS
// (Odoo's SCSS compiler forbids external @import directives).

/** Plus Jakarta Sans — configurator UI chrome font. */
const CONFIGURATOR_UI_FONT_URL =
    "https://fonts.googleapis.com/css2" +
    "?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400" +
    "&display=swap";

let _googleFontsLoaded = false;
function loadGoogleFonts() {
    if (_googleFontsLoaded) {
        return;
    }
    _googleFontsLoaded = true;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CONFIGURATOR_UI_FONT_URL;
    document.head.appendChild(link);
}

/**
 * Inject a single Google Fonts stylesheet for every head/body font used by
 * the curated styles.  Called from StyleSelectionScreen.setup() once the
 * font names have been read from CSS custom properties, so the list is always
 * derived from the actual style data rather than a hardcoded constant.
 *
 * @param {Array} styles  — result of StyleSelectionScreen._readStylesFromCSS()
 */
let _styleFontsLoaded = false;
function loadStyleFonts(styles) {
    if (_styleFontsLoaded) {
        return;
    }
    _styleFontsLoaded = true;
    const fontNames = new Set();
    for (const style of styles) {
        if (style.fontHead) fontNames.add(style.fontHead);
        if (style.fontBody) fontNames.add(style.fontBody);
    }
    const families = [...fontNames]
        .map((name) => encodeURIComponent(name) + ":wght@300;400;600;700;800;900")
        .join("&family=");
    const href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
    _currentStyleFontsHref = href;

    // Inject into document.head for the configurator chrome (style cards, etc.)
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);

    // Also push into any shadow roots that were created before this call
    // (unlikely but defensive — e.g. if a preview host mounts before Step 3).
    for (const sr of _previewShadowRoots) {
        if (!sr.querySelector(`link[href="${href}"]`)) {
            const srLink = document.createElement("link");
            srLink.rel = "stylesheet";
            srLink.href = href;
            sr.appendChild(srLink);
        }
    }
}

/**
 * Build the CSS text for the font override <style> block injected into each
 * shadow root.  Using explicit font-family on headings (rather than relying
 * on CSS custom-property inheritance from the compiled bundle) guarantees the
 * fonts render correctly regardless of how the bundle exposes them.
 *
 * @param {string} fontHead  - Heading typeface name, e.g. "Cormorant Garamond"
 * @param {string} fontBody  - Body typeface name, e.g. "Jost"
 * @returns {string}
 */
function _makeFontOverrideCSS(fontHead, fontBody) {
    return (
        `#wrapwrap { --body-font-family: '${fontBody}'; --o-heading-font-family: '${fontHead}' }`
    );
}

/**
 * Inject or update the font-override <style> in a single shadow root.
 * The style element is always (re-)appended so it sits after all bundle
 * <link>s and its rules win without needing !important.
 *
 * @param {ShadowRoot} sr
 * @param {string}     css
 */
function _injectFontOverride(sr, css) {
    let el = sr.querySelector("style[data-font-overrides]");
    if (!el) {
        el = document.createElement("style");
        el.setAttribute("data-font-overrides", "");
    } else {
        el.remove(); // will be re-appended below so it stays last
    }
    el.textContent = css;
    sr.appendChild(el);
}

// Store current fonts and push the override <style> into every active preview
// shadow root (called before the SCSS RPC resolves).
function _updateShadowRootFonts(fontHead, fontBody) {
    _currentStyleFonts = { fontHead, fontBody };
    const css = _makeFontOverrideCSS(fontHead, fontBody);
    for (const sr of _previewShadowRoots) {
        _injectFontOverride(sr, css);
    }
}

/**
 * Hot-swaps CSS bundles on the current document after SCSS recompilation.
 * Works whether the bundle was previously loaded or not (first injection).
 */
async function reloadBundles() {
    const bundles = await rpc("/website/theme_customize_bundle_reload");
    const allExistingLinkEls = [];
    const proms = [];
    const newHrefs = [];

    for (const [bundleName, bundleURLs] of Object.entries(bundles)) {
        const existingLinks = [...document.querySelectorAll(`link[href*="${bundleName}"]`)];
        let insertionEl = existingLinks.length
            ? existingLinks[existingLinks.length - 1]
            : document.head.lastElementChild;

        for (const url of bundleURLs) {
            const linkEl = document.createElement("link");
            linkEl.setAttribute("type", "text/css");
            linkEl.setAttribute("rel", "stylesheet");
            const stampedUrl = `${url}#t=${Date.now()}`;
            linkEl.setAttribute("href", stampedUrl);
            newHrefs.push(stampedUrl);
            const p = new Promise((resolve) => {
                linkEl.addEventListener("load", resolve);
                linkEl.addEventListener("error", resolve);
            });
            proms.push(p);
            insertionEl.insertAdjacentElement("afterend", linkEl);
            insertionEl = linkEl;
        }
        allExistingLinkEls.push(...existingLinks);
    }

    await Promise.all(proms);
    for (const el of allExistingLinkEls) {
        el.remove();
    }

    // Track the new hrefs and propagate them into every active preview shadow
    // root.  Awaited so that callers setting _bundleReloadDone = true do so only
    // once shadow roots have actually received and loaded the new stylesheets,
    // preventing a flicker where cards display with stale palette colours.
    _currentBundleHrefs = newHrefs;
    await _updateShadowRootBundles(newHrefs);
}

/**
 * Append a unique `_cb` cache-buster to every `.o_we_shape` background-image
 * URL inside a shadow root.
 *
 * Shape SVGs are rendered server-side with palette colours baked in at request
 * time (e.g. `?c5=o-color-3` → resolved hex).  After a palette swap the
 * browser would otherwise serve the old cached SVG for the same URL.
 *
 * Uses `getAttribute("style")` / `setAttribute("style", …)` rather than the
 * CSSOM `el.style.backgroundImage` property to avoid browser normalisation
 * issues (re-quoting, entity decoding, etc.) that can return an empty string
 * even when the attribute is present.
 *
 * @param {ShadowRoot} sr
 */
function _bustShapeUrlCaches(sr) {
    // Style-stable key: revisiting the same style produces identical URLs so the
    // browser and the server-side SVG cache both score a hit.  Falls back to a
    // timestamp before any style has been selected (initial render).
    const cb = _currentStyleId || Date.now();
    for (const el of sr.querySelectorAll(".o_we_shape")) {
        const style = el.getAttribute("style") || "";
        if (!style.includes("background-image")) continue;
        el.setAttribute(
            "style",
            style.replace(/url\((['"]?)([^)'"]+)\1\)/gi, (_, q, url) => {
                const clean = url.replace(/[?&]_cb=[^&)]+/g, "");
                const sep = clean.includes("?") ? "&" : "?";
                return `url(${q}${clean}${sep}_cb=${cb}${q})`;
            })
        );
    }
}

/**
 * Swap the website bundle CSS inside every registered preview shadow root
 * after a style recompilation.  All shadow roots are updated in parallel so
 * the total wait time is one round-trip, not N × round-trips.
 *
 * @param {string[]} newHrefs  Freshly stamped bundle URLs.
 */
async function _updateShadowRootBundles(newHrefs) {
    await Promise.all([..._previewShadowRoots].map(async (sr) => {
        const existingLinks = [...sr.querySelectorAll('link[rel="stylesheet"]')];
        const loads = newHrefs.map((href) => {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.type = "text/css";
            link.href = href;
            const p = new Promise((res) => {
                link.addEventListener("load", res);
                link.addEventListener("error", res);
            });
            sr.appendChild(link);
            return p;
        });
        await Promise.all(loads);
        existingLinks.forEach((l) => l.remove());
        // Re-append the font override so it remains after the new bundle links
        // and its rules take precedence without requiring !important.
        if (_currentStyleFonts) {
            _injectFontOverride(sr, _makeFontOverrideCSS(
                _currentStyleFonts.fontHead, _currentStyleFonts.fontBody
            ));
        }
        // Bust cached shape SVGs so the new palette colours are fetched.
        // This covers the case where the html prop does NOT change after a
        // style switch (so _updateShadowContent won't reset innerHTML and
        // the _cb mutations applied here will persist).
        _bustShapeUrlCaches(sr);
    }));
}

// ── LayoutPreviewHost ─────────────────────────────────────────────────────────
/**
 * Renders arbitrary HTML inside an open Shadow DOM root so that:
 *   • website bundle CSS is fully isolated from the configurator chrome
 *   • the configurator CSS cannot bleed into the preview content
 *   • parallax JS (document.querySelectorAll) cannot cross the boundary
 *   • CSS custom properties (palette colours, fonts) still inherit through
 *
 * The host element's style attribute comes from `props.hostStyle` (applied by
 * Owl's template), typically carrying `transform:scale(…)` and positioning.
 * Inside the shadow root a plain wrapper div holds the server-rendered HTML.
 */
export class LayoutPreviewHost extends Component {
    static template = xml`<div t-custom-ref="host" t-att-style="this.props.hostStyle" class="o_layout_preview_host o_cc o_cc1"/>`;
    static props = {
        html:      { type: String, optional: true },
        hostStyle: { type: String, optional: true },
    };

    setup() {
        this.hostRef = useRef("host");
        this._lastRenderedHtml = null;

        onMounted(() => {
            const host = this.hostRef.el;
            if (!host || host.shadowRoot) return;
            const sr = host.attachShadow({ mode: "open" });
            _previewShadowRoots.add(sr);

            // Normalization rules that must live inside the shadow root — they
            // cannot be provided from configurator.scss since CSS does not cross
            // shadow boundaries.
            const style = document.createElement("style");
            style.textContent = PREVIEW_SHADOW_STYLES;
            sr.appendChild(style);

            // Inject the current website bundle stylesheets (already in the
            // browser cache from the document.head injection in reloadBundles).
            for (const href of _currentBundleHrefs) {
                const link = document.createElement("link");
                link.rel = "stylesheet";
                link.type = "text/css";
                link.href = href;
                sr.appendChild(link);
            }

            // Inject the Google Fonts stylesheet for the curated style fonts.
            // @font-face rules do not cross shadow boundaries, so even though
            // loadStyleFonts() already added this to document.head, each
            // shadow root needs its own <link> for the fonts to render.
            if (_currentStyleFontsHref) {
                const fontsLink = document.createElement("link");
                fontsLink.rel = "stylesheet";
                fontsLink.href = _currentStyleFontsHref;
                sr.appendChild(fontsLink);
            }

            // Inject the font-family override <style> so headings and body text
            // use the selected typefaces.  Must come after the bundle <link>s so
            // its rules take precedence without needing !important.
            if (_currentStyleFonts) {
                _injectFontOverride(sr, _makeFontOverrideCSS(
                    _currentStyleFonts.fontHead, _currentStyleFonts.fontBody
                ));
            }

            // Set initial HTML content.
            this._updateShadowContent(sr, this.props.html);
        });

        // Re-render shadow content when the html prop changes (e.g. heading
        // adaptation arrives after the card is already displayed).
        useLayoutEffect(
            () => {
                const sr = this.hostRef.el?.shadowRoot;
                if (!sr) return; // shadow root not created yet (fires before onMounted)
                this._updateShadowContent(sr, this.props.html);
            },
            () => [this.props.html]
        );

        onWillUnmount(() => {
            const sr = this.hostRef.el?.shadowRoot;
            if (sr) _previewShadowRoots.delete(sr);
        });
    }

    _updateShadowContent(sr, html) {
        let wrapper = sr.querySelector(".o_shadow_content");
        if (!wrapper) {
            wrapper = document.createElement("div");
            wrapper.className = "o_shadow_content";
            sr.appendChild(wrapper);
        }
        const rawHtml = html?.toString() || "";
        if (rawHtml !== this._lastRenderedHtml) {
            wrapper.innerHTML = rawHtml;
            this._lastRenderedHtml = rawHtml;
            // Bust shape URL caches immediately after the DOM is written.
            // This is the primary fix for the race condition: onStyleChange
            // calls reloadBundles() (which also calls _bustShapeUrlCaches),
            // but then _loadPreview() re-sets previewHtml.value → Owl
            // re-renders → this path runs and resets wrapper.innerHTML,
            // discarding those earlier _cb mutations.  Doing it here ensures
            // the shapes always carry a fresh _cb regardless of ordering.
            _bustShapeUrlCaches(sr);
            // The preview lives in a Shadow DOM that public interactions
            // (TextHighlight) cannot pierce.  Regenerate text-highlight SVGs
            // explicitly, but only after:
            //   1. The shadow root's <link> stylesheets have been parsed
            //      (on first mount they are added just before this call, so
            //      link.sheet is still null — we must wait for their load events).
            //   2. document.fonts.ready resolves so the correct typeface and
            //      font-size are applied before getClientRects() is called.
            const pendingLinks = [...sr.querySelectorAll("link[rel='stylesheet']")]
                .filter((link) => !link.sheet);
            const linksReady = pendingLinks.length
                ? Promise.all(
                      pendingLinks.map(
                          (link) =>
                              new Promise((res) => {
                                  link.addEventListener("load", res, { once: true });
                                  link.addEventListener("error", res, { once: true });
                              })
                      )
                  )
                : Promise.resolve();
            Promise.all([linksReady, document.fonts.ready])
                .then(() =>
                    requestAnimationFrame(() => {
                        if (!wrapper.isConnected) return;
                        for (const el of wrapper.querySelectorAll(".o_text_highlight")) {
                            const highlightID = getCurrentTextHighlight(el);
                            if (!highlightID) continue;
                            for (const svg of el.querySelectorAll(".o_text_highlight_svg")) {
                                svg.remove();
                            }
                            const svgs = makeHighlightSvgs(el, highlightID);
                            for (const svg of svgs.toReversed()) {
                                el.insertAdjacentElement("afterbegin", svg);
                                adaptHighlightPosition(el, svg);
                            }
                        }
                    })
                )
                .catch(() => {});
        }
    }
}

// Apply a style selection: persist it, push font overrides immediately, then
// recompile the user SCSS and hot-swap the website bundle. Shared by the
// Step-7 preview and the Step-5 layout grid (both render in shadow roots that
// reloadBundles() refreshes), so the behaviour stays identical.
async function applyStyleChange(orm, state, styleId) {
    const enriched = getAllStyles(state).find((s) => s.id === styleId);
    if (!enriched) return;
    state.selectedStyle = enriched;
    _updateShadowRootFonts(enriched.fontHead, enriched.fontBody);
    _currentStyleId = styleId;
    try {
        _pendingStyleCustomizationDone = false;
        _pendingStyleCustomization = (async () => {
            for (const [path, values] of styleScssWrites(enriched)) {
                await orm.call(
                    "website.assets",
                    "make_scss_customization",
                    [path, values],
                );
            }
        })();
        await _pendingStyleCustomization;
        _pendingStyleCustomization = null;
        _pendingStyleCustomizationDone = true;
        await reloadBundles();
        _bundleReloadDone = true;
    } catch (_e) {
        _pendingStyleCustomizationDone = true;
        // style change failed
    }
}

//------------------------------------------------------------------------------
// Components
//------------------------------------------------------------------------------

// Style + Vibe dropdown pair. The selection side-effect is delegated to the
// host via onSelectStyle / onSelectVibe so the same UI/logic can drive both
// the Step-7 single preview and the Step-5 layout grid.
export class StyleVibeDropdowns extends Component {
    static template = "website.Configurator.StyleVibeDropdowns";
    static props = {
        onSelectStyle: Function,
        onSelectVibe: Function,
        openUp: { type: Boolean, optional: true },
    };

    setup() {
        this.state = useStore();
        this.vibes = VIBES;
        this.styleDropOpen = proxy({ value: false });
        this.vibeDropOpen = proxy({ value: false });

        this.allStyles = getAllStyles(this.state);
        const catMap = new Map();
        for (const s of this.allStyles) {
            if (!catMap.has(s.category)) catMap.set(s.category, []);
            catMap.get(s.category).push(s);
        }
        this.allStylesByCategory = [...catMap.entries()].map(([id, styles]) => ({
            id,
            title: STYLE_CATEGORIES[id] || (id === "user_category" ? _t("From your logo") : id),
            styles,
        }));

        useExternalListener(document, "click", (ev) => {
            if (!ev.target.closest(".o_preview_dd")) {
                this.styleDropOpen.value = false;
                this.vibeDropOpen.value = false;
            }
        });
    }

    // Selected style enriched with colors + fonts (falls back to allStyles).
    get _selStyle() {
        const sel = this.state.selectedStyle;
        if (sel?.colors) return sel;
        return this.allStyles.find((s) => s.id === sel?.id) || this.allStyles[0];
    }

    toggleStyleDrop(ev) {
        ev.stopPropagation();
        this.vibeDropOpen.value = false;
        this.styleDropOpen.value = !this.styleDropOpen.value;
    }

    toggleVibeDrop(ev) {
        ev.stopPropagation();
        this.styleDropOpen.value = false;
        this.vibeDropOpen.value = !this.vibeDropOpen.value;
    }

    selectStyle(styleId) {
        this.styleDropOpen.value = false;
        this.props.onSelectStyle(styleId);
    }

    selectVibe(vibeId) {
        this.vibeDropOpen.value = false;
        this.props.onSelectVibe(vibeId);
    }
}

export class SkipButton extends Component {
    static template = "website.Configurator.SkipButton";
    static props = {
        skip: Function,
        back: { type: Function, optional: true },
        slots: { type: Object, optional: true },
    };
}

export class WelcomeScreen extends Component {
    static template = "website.Configurator.WelcomeScreen";
    static components = { SkipButton };
    static props = {
        skip: Function,
        navigate: Function,
    };
    setup() {
        this.state = useStore();
    }

    goToDescription() {
        this.props.navigate(ROUTES.descriptionScreen);
    }
}

// ── IndustryImageShowcase ─────────────────────────────────────────────────────
// Renders the 9 fixed floating image cards on the right side of the
// DescriptionScreen.  Each slot reveals (o_cfg_slot_fetched) as soon as its
// image has decoded, creating a progressive "pictures appear" effect.
//
// Desktop only (the component is wrapped in d-none d-lg-block in its template).
// Pointer-events are disabled so the panel never interferes with the form.
class IndustryImageShowcase extends Component {
    static template = "website.Configurator.IndustryImageShowcase";
    static props = {};

    setup() {
        // Observe the module-level reactive showcase state; each slot's
        // `fetched` flag flips independently as its image decodes. Slots are
        // populated only once a valid industry is selected.
        this.showcase = proxy(_showcaseImages);
    }
}

export class DescriptionScreen extends Component {
    static template = "website.Configurator.DescriptionScreen";
    static components = { SkipButton, AutoComplete, IndustryImageShowcase };
    static props = {
        navigate: Function,
        skip: Function,
    };
    setup() {
        this.industrySelection = useRef("industrySelection");
        this.purposeSelectionRef = useRef("purposeSelection");
        this.state = useStore();
        this.orm = useService("orm");
        useAutofocus();

        // Tracks the raw text currently in the industry input.
        // Used to resize the wrapper width in real-time as the user types.
        this.industryText = proxy({ value: '' });

        this.splitRegex = /[|\s,]+/;

        this.dictionarySet = new Set();
        for (const industry of this.state.industries) {
            let industryWords = this._splitToSet(industry.label);
            if (industry.synonyms) {
                industryWords = industryWords.union(this._splitToSet(industry.synonyms));
            }
            this.dictionarySet = this.dictionarySet.union(industryWords);
        }

        onMounted(() => this.onMounted());

        // Autofocus the next field once the current one is confirmed.
        useLayoutEffect(
            (selectedType, selectedIndustry) => {
                if (selectedType && !selectedIndustry) {
                    this.industrySelection.el?.querySelector("input").focus();
                }
                if (selectedIndustry) {
                    this.purposeSelectionRef.el?.focus();
                }
            },
            () => [this.state.selectedType, this.state.selectedIndustry]
        );

        this.safariHackFocusedOutDropdown = null;
    }

    onMounted() {
        // Reset positioning so back-nav doesn't auto-advance.
        this.state.selectPositioning();
    }

    /**
     * Inline style for the industry wrapper label.
     * Sets `width` in `ch` units so the label (and the absolutely-positioned
     * input inside it) grows to fit whatever the user has typed.
     * Below 17 ch the CSS `min-width: 17ch` takes over, so we only emit a
     * style when the text is longer than that threshold.
     */
    get industryWrapperStyle() {
        const len = this.industryText.value.length;
        return `width: calc(${len}ch * 0.725 + 5px)`; // font derived multiplier + padding to match input width
    }

    _setSelectedIndustry(label, id) {
        this.industryText.value = label || '';
        this.state.selectIndustry(label, id);
        this.fetchPositionings(label);
        // Swap the showcase slots to this industry's images (or defaults).
        updateShowcaseForIndustry(id);
        // Eagerly prefetch the layout previews for EVERY vibe (not just clean)
        // and the industry banner.  get_layout_previews only depends on
        // (vibe, industry_id) — industry_id solely drives image substitution;
        // structure and heading text are industry-independent — so the moment
        // the industry is known we can fetch all of them.  Doing it here
        // (instead of waiting for the positioning step) hides the heavy
        // ~3s/vibe fetches behind the positioning dwell time (the ~2s
        // fetchPositionings call + the user reading/choosing) and keeps those
        // large transfers off the post-positioning critical path where they
        // would otherwise contend with / queue ahead of the AI generate_text
        // call.  prefetchLayoutPreviews is idempotent, so the positioning-time
        // prefetchAllVibeAssets() just reuses these cached results.
        if (id) {
            for (const vibe of VIBES) {
                prefetchLayoutPreviews(id, vibe.id);
            }
            prefetchIndustryBanner(id);
        }
    }

    // Fetch 6 AI-suggested positioning options for the industry, store in state.
    async fetchPositionings(industryLabel) {
        const fallback = ["premium", "affordable", "professional", "modern", "community-focused", "innovative"];
        this.state.positionings = [];
        this.state.selectedPositioning = undefined;
        this.state.positioningsLoading = true;
        try {
            const prompt = `Design a website for my ${industryLabel} business with a _______ positioning. Return only a JSON array of 6 possibilities to fill in the blank.`;
            const response = await rpc("/html_editor/generate_text", {
                prompt,
                conversation_history: [],
            });
            const match = response?.match(/\[[\s\S]*]/);
            const parsed = match && JSON.parse(match[0]);
            this.state.positionings =
                Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
                    ? parsed
                    : fallback;
        } catch {
            this.state.positionings = fallback;
        }
        this.state.positioningsLoading = false;
    }

    _splitToSet(string) {
        return new Set(string.toLowerCase().split(this.splitRegex));
    }

    get sources() {
        return [
            {
                options: (request) => (request.length < 1 ? [] : this._autocompleteSearch(request)),
            },
        ];
    }
    /**
     * Called each time the autocomplete input's value changes. Only industries
     * having a label or a synonym containing all terms of the input value are
     * kept.
     * The order received from IAP is kept (expected to be on descending hit
     * count) unless there are 7 or less matches in which case the results are
     * sorted alphabetically.
     * The result size is limited to 30.
     *
     * @param {String} term input current value
     */
    _autocompleteSearch(term) {
        this.state.selectedIndustry = undefined;
        const termsSet = this._splitToSet(term);

        //-------words correction--------
        // Check and correct all the terms
        const correctedSet = new Set();
        for (const term of termsSet) {
            if (this.dictionarySet.has(term)) {
                correctedSet.add(term);
                continue;
            }
            const res = fuzzyLevenshteinLookup(term, this.dictionarySet);
            correctedSet.add(res[0] || term);
        }
        let terms = Array.from(correctedSet);
        const limit = 30;
        // `this.state.industries` is already sorted by hit count (from IAP).
        // That order should be kept after manipulating the recordset.
        let matches = this.state.industries.filter((val, index) =>
            // To match, every term should be contained in the label
            terms.every((term) => val.label.toLowerCase().includes(term))
        );

        matches = matches.sort((x, y) => x.hitCountOrder - y.hitCountOrder);
        if (matches.length > limit) {
            // Keep matches with the least number of words so that e.g.
            // "restaurant" remains available even if there are 30 specific
            // sub-types that have a higher hit count.
            matches = matches
                .sort((x, y) => x.wordCount - y.wordCount)
                .slice(0, limit)
                .sort((x, y) => x.hitCountOrder - y.hitCountOrder);
        } else {
            let synonymMatches = this.state.industries.filter((val, index) => {
                // To match, every term should be contained in the synonym
                for (const candidate of [...(val.synonyms || "").split(/[|,]/)]) {
                    // Check if industry label has already matched
                    if (
                        terms.every((term) => candidate.toLowerCase().includes(term)) &&
                        !matches.includes(val)
                    ) {
                        return true;
                    }
                }
                return false;
            });
            synonymMatches = synonymMatches.sort((x, y) => x.hitCountOrder - y.hitCountOrder);
            matches = matches.concat(synonymMatches);
            if (matches.length > limit) {
                matches = matches.slice(0, limit);
            }
        }
        if (matches.length === 0) {
            matches = [{ label: term, id: -1 }];
            terms = [term];
        }
        return matches.map((match) => ({
            label: match.label,
            labelTermOrder: this._getMatchTermOrder(match.label, terms),
            onSelect: () => this._setSelectedIndustry(match.label, match.id),
        }));
    }

    /**
     * Splits the string parameter 'label' into bits based on the location
     * of the 'terms' typed by the user.
     *
     * @param {string} label
     * @param {string[]} terms
     * @returns {object}
     * The return object 'matchTermOrder' contains two lists:
     * - 'labelBits' store all the segments of the split 'label'
     * - 'searchTermIndexes' keeps the indexes of the bits that matches with the 'terms'
     */
    _getMatchTermOrder(label, terms) {
        const sortedTerms = terms.sort((a, b) => b.length - a.length);
        const matchTermOrder = {
            labelBits: [],
            searchTermIndexes: [],
        };
        if (!label) {
            return matchTermOrder;
        }

        matchTermOrder.labelBits.push(label);
        for (const term of sortedTerms) {
            let bitIndex = 0;
            while (bitIndex < matchTermOrder.labelBits.length) {
                const currentBit = matchTermOrder.labelBits[bitIndex];
                const splitBits = currentBit.split(new RegExp(`(${escapeRegExp(term)})`, "i"));
                matchTermOrder.labelBits.splice(bitIndex, 1, ...splitBits);
                bitIndex += splitBits.length;
            }
        }
        // Saves the indexes of the segments matching the terms
        const labelBits = [];
        for (const i in matchTermOrder.labelBits) {
            labelBits.push({
                bit: matchTermOrder.labelBits[i],
                id: i,
            });
            if (sortedTerms.includes(matchTermOrder.labelBits[i].toLowerCase())) {
                matchTermOrder.searchTermIndexes.push(i);
            }
        }
        matchTermOrder.labelBits = labelBits;
        return matchTermOrder;
    }

    selectWebsiteType(id) {
        this.state.selectWebsiteType(id);
        this.checkDescriptionCompletion();
    }

    selectPositioning(positioning) {
        this.state.selectPositioning(positioning);
        // Kick off AI heading adaptation as soon as both industry and positioning
        // are known.  The result will be ready (or nearly so) by the time the
        // user reaches the Layout (Step 5) and Preview (Step 7) screens.
        const { selectedIndustry } = this.state;
        if (positioning && selectedIndustry) {
            prefetchAdaptedHeadings(
                selectedIndustry.label,
                positioning,
                selectedIndustry.id ?? null,
            );
            // Now that industry + positioning are both known, start warming
            // every vibe's layout previews and (where the vibe actually
            // mutates text) the supplemental AI heading adaptation.  This
            // typically runs in parallel with the user navigating through
            // Style (Step 3) and reaching Vibe (Step 4), so the heaviest
            // round-trips are already resolved when they get there.
            prefetchAllVibeAssets(
                selectedIndustry.id ?? null,
                positioning,
                selectedIndustry.label || "",
            );
        }
        this.checkDescriptionCompletion();
    }

    checkDescriptionCompletion() {
        const { selectedType, selectedPositioning, selectedIndustry } = this.state;
        if (selectedType && selectedPositioning && selectedIndustry) {
            if (selectedIndustry.id === -1) {
                this.orm.call("website", "configurator_missing_industry", [], {
                    unknown_industry: selectedIndustry.label,
                });
            }
            this.props.navigate(ROUTES.styleSelectionScreen);
        }
    }
    onConfiguratorScreenFocusin(ev) {
        // On safari, hide the previously focused out dropdown if focusin is
        // outside of it
        if (isBrowserSafari() && this.safariHackFocusedOutDropdown) {
            if (ev.target.closest(".dropdown") !== this.safariHackFocusedOutDropdown) {
                window.Dropdown.getOrCreateInstance(this.safariHackFocusedOutDropdown).hide();
            }
            this.safariHackFocusedOutDropdown = null;
        }
    }
    /**
     * Hide the dropdown once the focus isn't contained within it anymore.
     *
     * @param {FocusEvent} ev
     */
    onDropdownFocusout(ev) {
        // On safari, we are missing relatedTarget because we can't focus on a
        // button, so we delay dropdown hiding to focusin of next element
        if (isBrowserSafari()) {
            this.safariHackFocusedOutDropdown = ev.currentTarget;
            return;
        }
        if (ev.relatedTarget?.closest(".dropdown") !== ev.currentTarget) {
            window.Dropdown.getOrCreateInstance(ev.currentTarget).hide();
        }
    }

    onAutocompleteInput({ inputValue }) {
        this.industryText.value = inputValue || '';
        if (!inputValue) {
            this.state.selectIndustry(); // reset
            updateShowcaseForIndustry(null); // hide the showcase
        }
    }
}

export class StyleSelectionScreen extends Component {
    static components = { SkipButton };
    static template = "website.Configurator.StyleSelectionScreen";
    static props = {
        navigate: Function,
        skip: Function,
        back: { type: Function, optional: true },
    };
    setup() {
        this.state = useStore();
        this.notification = useService("notification");
        this.orm = useService("orm");
        this.logoInputRef = useRef("logoSelectionInput");
        this.styles = this._readStylesFromCSS();
        this.stylesByCategory = this._groupStylesByCategory(this.styles);
        // Inject Google Fonts for the style card previews once font names
        // are known from CSS custom properties.
        loadStyleFonts(this.styles);

        // ── Palette hover — adapts the container bg/text like the prototype ──
        this._leaveTimer = null;

        onMounted(() => {
            // Restore palette appearance when navigating back to this step.
            this._applyPaletteVars(this.state.selectedStyle);
            // A logo may already exist (company logo from configurator_init or
            // an earlier upload restored from sessionStorage) without a derived
            // palette yet — extract it so the user styles are offered.
            if (this.state.logo && !this.state.recommendedColors) {
                this.updatePalettes().catch(() => {});
            }
        });

        onWillUnmount(() => {
            if (this._leaveTimer) {
                clearTimeout(this._leaveTimer);
                this._leaveTimer = null;
            }
            // Leave the selected style's vars in place — the next step (Vibe) shows
            // a full-screen overlay that resets the bg implicitly.  Don't hard-reset
            // here so there's no flash back to the default before the route change.
        });
    }

    // ── Palette CSS-var helpers ────────────────────────────────────────────────

    /**
     * Write `--o-cfg-palette-bg` and `--o-cfg-palette-text` onto the
     * `.o_configurator_container` element so the SCSS transitions pick them up.
     * Also updates `--ConfiguratorLogo-filter` so the Odoo logo remains
     * readable when the hovered palette has a dark background.
     *
     * @param {object|null|undefined} style  Enriched style token object.
     */
    _applyPaletteVars(style) {
        const container = document.querySelector(".o_configurator_container");
        if (!container) return;
        const bg   = style?.colors?.[3] || null;
        const text = style?.colors?.[4] || null;
        if (bg)   { container.style.setProperty("--o-cfg-palette-bg",   bg);   }
        else      { container.style.removeProperty("--o-cfg-palette-bg");       }
        if (text) { container.style.setProperty("--o-cfg-palette-text", text);  }
        else      { container.style.removeProperty("--o-cfg-palette-text");     }
        // Logo filter: saturate(0) brightness(1000%) makes any tinted logo white.
        const dark = bg ? isColorDark(bg) : false;
        document.documentElement.style.setProperty(
            "--ConfiguratorLogo-filter",
            dark ? "saturate(0) brightness(1000%)" : ""
        );
    }

    // ── Card hover handlers ────────────────────────────────────────────────────

    /** Called on mouseenter of a style card — immediately adapts the view. */
    _onStyleHover(style) {
        if (this._leaveTimer) {
            clearTimeout(this._leaveTimer);
            this._leaveTimer = null;
        }
        this._applyPaletteVars(style);
    }

    /**
     * Called on mouseleave of a style card.
     * A 500ms debounce prevents the bg flashing when the pointer moves between
     * cards in the same row. On expiry, reverts to the currently *selected*
     * style (not a hard reset).
     */
    _onStyleLeave() {
        this._leaveTimer = setTimeout(() => {
            this._leaveTimer = null;
            this._applyPaletteVars(this.state.selectedStyle);
        }, 500);
    }

    _readStylesFromCSS() {
        return readAllStyleTokens();
    }

    _groupStylesByCategory(styles) {
        const grouped = new Map();
        for (const style of styles) {
            if (!grouped.has(style.category)) grouped.set(style.category, []);
            grouped.get(style.category).push(style);
        }
        const result = [];
        for (const [catId, catLabel] of Object.entries(STYLE_CATEGORIES)) {
            if (grouped.has(catId)) {
                result.push({ id: catId, title: catLabel, styles: grouped.get(catId) });
            }
        }
        return result;
    }

    // ── Logo → user-generated styles ───────────────────────────────────────────

    get userStyles() {
        return buildUserStyles(this.state.recommendedColors);
    }

    /** Open the hidden file picker. */
    uploadLogo() {
        this.logoInputRef.el.click();
    }

    /** Remove the uploaded logo, its attachment and the derived palette. */
    async removeLogo(ev) {
        ev.stopPropagation();
        // Allow re-selecting the same file later.
        this.logoInputRef.el.value = "";
        if (this.state.logoAttachmentId) {
            await this._removeAttachments([this.state.logoAttachmentId]);
        }
        this.state.changeLogo();          // clears logo + recommendedColors
        this.state.setRecommendedColors();
    }

    /** Upload the picked file and derive a palette from it. */
    async changeLogo() {
        const input = this.logoInputRef.el;
        if (input.files.length !== 1) {
            return;
        }
        const previousAttachmentId = this.state.logoAttachmentId;
        const file = input.files[0];
        if (file.size > 2500000) {
            this.notification.add(
                _t("The logo is too large. Please upload a logo smaller than 2.5 MB."),
                { title: file.name, type: "warning" }
            );
            return;
        }
        const data = await getDataURLFromFile(file);
        const attachment = await rpc("/web_editor/attachment/add_data", {
            name: "logo",
            data: data.split(",")[1],
            is_image: true,
        });
        if (attachment.error) {
            this.notification.add(attachment.error, { title: file.name });
            return;
        }
        if (previousAttachmentId) {
            await this._removeAttachments([previousAttachmentId]);
        }
        this.state.changeLogo(data, attachment.id);
        await this.updatePalettes();
    }

    /** Extract the primary/secondary colours from the logo → derived palette. */
    async updatePalettes() {
        let img = this.state.logo;
        if (img.startsWith("data:image/svg+xml")) {
            img = await svgToPNG(img);
        }
        if (img.startsWith("data:image/webp")) {
            img = await webpToPNG(img);
        }
        img = img.split(",")[1];
        const [color1, color2] = await this.orm.call(
            "base.document.layout",
            "extract_image_primary_secondary_colors",
            [img],
            { mitigate: 255 }
        );
        this.state.setRecommendedColors(color1, color2);
    }

    async _removeAttachments(ids) {
        await rpc("/html_editor/attachment/remove", { ids });
    }

    selectStyle(style) {
        this.state.selectedStyle = style;
        // Clear leave-debounce and lock the hovered palette in place so there's
        // no revert flash between click and route change.
        if (this._leaveTimer) {
            clearTimeout(this._leaveTimer);
            this._leaveTimer = null;
        }
        this._applyPaletteVars(style);
        // Use standalone rpc() instead of this.orm.call() so the promise is a
        // plain native Promise, NOT an Abortable one tied to this component's
        // lifecycle. When StyleSelectionScreen unmounts, OWL cancels all
        // this.orm promises — which would leave _pendingStyleCustomization
        // hanging forever in LayoutSelectionScreen.onMounted.
        _pendingStyleCustomizationDone = false;
        _bundleReloadDone = false;   // new style → bundles will need to be refreshed
        _pendingBundleReload = null;
        // Push font overrides to any open shadow roots immediately — before the
        // SCSS round-trip — so previews update as fast as possible.
        _updateShadowRootFonts(style.fontHead, style.fontBody);
        _currentStyleId = style.id;
        // One write for premade styles; user-generated styles also write their
        // custom colour palette to user_color_palette.scss.  Sequential so the
        // files are on disk before reloadBundles() recompiles.
        _pendingStyleCustomization = (async () => {
            for (const [path, values] of styleScssWrites(style)) {
                await rpc("/web/dataset/call_kw", {
                    model: "website.assets",
                    method: "make_scss_customization",
                    args: [path, values],
                    kwargs: {},
                });
            }
        })();
        _pendingStyleCustomization
            .then(() => {
                _pendingStyleCustomizationDone = true;
                // Proactively reload CSS bundles right after SCSS finishes so
                // that by the time the user navigates to Step 5 (layout cards)
                // the correct theme CSS is already applied.  We share this
                // Promise via _pendingBundleReload so LayoutSelectionScreen can
                // await it without issuing a second parallel reload.
                _pendingBundleReload = reloadBundles()
                    .then(() => { _bundleReloadDone = true; _pendingBundleReload = null; })
                    .catch(() => { _bundleReloadDone = true; _pendingBundleReload = null; });
            })
            .catch(() => { _pendingStyleCustomizationDone = true; });
        this.props.navigate(ROUTES.vibeSelectionScreen);
    }

    getSelectedStyleId() {
        return this.state.selectedStyle ? this.state.selectedStyle.id : false;
    }
}

// ── Vibe screen colour helpers ─────────────────────────────────────────────────

/**
 * Returns true if the hex colour is perceived as dark
 * (luma threshold 0.5 on a 0-1 scale).
 * @param {string} hex  e.g. '#1A222B' or '1A222B'
 */
function isColorDark(hex = '') {
    const h = hex.replace('#', '');
    const parse = (s) => parseInt(s, 16);
    let r, g, b;
    if (h.length === 3) {
        r = parse(h[0] + h[0]); g = parse(h[1] + h[1]); b = parse(h[2] + h[2]);
    } else if (h.length === 6) {
        r = parse(h.slice(0, 2)); g = parse(h.slice(2, 4)); b = parse(h.slice(4, 6));
    } else {
        return false;
    }
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/** Returns '#fff' or '#1A222B' depending on the background colour. */
function readableOn(hex) {
    return isColorDark(hex) ? '#fff' : '#1A222B';
}

export class VibeSelectionScreen extends Component {
    static components = { SkipButton };
    static template = "website.Configurator.VibeSelectionScreen";
    static props = {
        navigate: Function,
        skip: Function,
        back: { type: Function, optional: true },
    };

    setup() {
        this.state = useStore();
        this.vibes = VIBES;
        // Restore previously picked vibe when navigating back.
        this.pickedVibe = proxy({ value: this.state.selectedVibe?.id || null });
        this.industryImageUrl = proxy({
            value: '/web/image/website.s_banner_default_image',
        });

        // ── Illustrative-vibe SVG state ───────────────────────────────────────
        // bgItems:   6 floating SVGs for the full-screen background layer.
        // cardLeft / cardRight: small decorators rendered inside the vibe button.
        this.illustrativeSvgs = proxy({ bgItems: [], cardLeft: null, cardRight: null });

        onMounted(async () => {
            const industryId = this.state.selectedIndustry?.id ?? null;
            if (industryId) {
                try {
                    // Use the prefetched promise if available; fall back to a
                    // fresh fetch if the cache was invalidated (e.g. industry
                    // changed after the component was already mounted once).
                    const bannerPromise =
                        getCachedBanner(industryId) ||
                        rpc('/website/configurator/get_industry_banner', {
                            industry_id: industryId,
                        });
                    const url = await bannerPromise;
                    if (url) this.industryImageUrl.value = url;
                } catch (_e) { /* keep default */ }
            }
            // Load illustrative SVGs in parallel with the banner — non-blocking.
            this._loadIllustrativeSvgs();
            // Safety net: the same prefetch normally fires at positioning
            // select (Step 2).  Re-running here is idempotent and covers
            // edge cases like back-navigation after changing the industry.
            this._prefetchAllVibes();
        });
    }

    _prefetchAllVibes() {
        const industryId = this.state.selectedIndustry?.id ?? null;
        const positioning = this.state.selectedPositioning || this.state.formerSelectedPositioning || "";
        const industryLabel = this.state.selectedIndustry?.label || "";
        prefetchAllVibeAssets(industryId, positioning, industryLabel);
    }

    _prefetchVibe(vibeId) {
        const industryId = this.state.selectedIndustry?.id ?? null;
        const positioning = this.state.selectedPositioning || this.state.formerSelectedPositioning || "";
        const industryLabel = this.state.selectedIndustry?.label || "";
        prefetchVibeAssets(vibeId, industryId, positioning, industryLabel);
    }

    // ── Illustrative SVG loading ───────────────────────────────────────────────

    /**
     * Fetch the 6 illustrative background SVGs and the 2 vibe-card decorators
     * from /website/static/src/img/configurator/, rewrite their fill colours to
     * match the current palette (mirrors InlineSvg + IllustrativeBg from the
     * prototype), and store the results as markup() objects in this.illustrativeSvgs.
     *
     * Positions, sizes, and animation names mirror the prototype's svgs[] array
     * exactly (cx/cy are offset from the filename to intentional composition coords).
     */
    async _loadIllustrativeSvgs() {
        const tk = this.styleTokens;
        // colorKey (string '1'–'5') → palette hex colour
        const colorMap = { '1': tk.c1, '2': tk.c2, '3': tk.c3, '5': tk.c5 };

        // Background layer: 6 floating elements (same config as prototype svgs[])
        const BG_CONFIG = [
            { file: '3-50-50.svg', colorKey: '3', cx: 50, cy: 50, w: 860, anim: 'o_illus_float_0', dur: 4 },
            { file: '1-35-25.svg', colorKey: '1', cx: 15, cy: 20, w: 110, anim: 'o_illus_float_1', dur: 3.5  },
            { file: '1-80-75.svg', colorKey: '1', cx: 88, cy: 76, w: 140, anim: 'o_illus_float_2', dur: 3.4  },
            { file: '2-25-75.svg', colorKey: '2', cx: 20, cy: 75, w: 200, anim: 'o_illus_float_3', dur: 3.5 },
            { file: '2-60-30.svg', colorKey: '2', cx: 79, cy: 18, w: 160, anim: 'o_illus_float_4', dur: 2.8  },
            { file: '5-60-70.svg', colorKey: '5', cx: 60, cy: 70, w: 190, anim: 'o_illus_float_5', dur: 3.1 },
        ];

        /**
         * Obtain raw SVG text for `file`, preferring the module-level prefetch
         * cache over a cold fetch.  Three cases handled:
         *
         *   1. Prefetch already resolved → synchronous Map lookup, no await.
         *   2. Prefetch in-flight       → await its Promise (shared round-trip).
         *   3. No prefetch at all       → fall back to a direct fetch().
         */
        async function getRawText(file) {
            if (_prefetchedIllusSvgs?.result) {
                // Case 1: already resolved — O(1) Map lookup, no I/O
                return _prefetchedIllusSvgs.result.get(file) ?? null;
            }
            if (_prefetchedIllusSvgs?.promise) {
                // Case 2: in-flight — piggyback on the shared Promise
                const map = await _prefetchedIllusSvgs.promise;
                return map?.get(file) ?? null;
            }
            // Case 3: prefetch was never started (should not happen in normal flow)
            return fetch(`${ILLUS_SVG_BASE}/${file}`).then((r) => r.text()).catch(() => null);
        }

        /**
         * Get raw SVG text, rewrite fill colours to match the palette, make
         * the root <svg> responsive, and wrap in markup() for OWL's t-out.
         */
        async function fetchColored(file, fillColor) {
            try {
                let text = await getRawText(file);
                if (!text) return null;
                if (fillColor) {
                    // Attribute form: fill="…"  (skip fill="none")
                    text = text.replace(/fill="(?!none)([^"]*)"/g, `fill="${fillColor}"`);
                    // CSS inline form: fill:…   (skip fill:none)
                    text = text.replace(/fill:(?!none)([^;}"]*)/g, `fill:${fillColor}`);
                }
                // Make the SVG scale to its containing div (width set by wrapper)
                text = text.replace(/<svg\b/, '<svg style="width:100%;height:auto;display:block;"');
                return markup(text);
            } catch (_e) {
                return null;
            }
        }

        // Fetch all in parallel
        const [bgResults, cardLeft, cardRight] = await Promise.all([
            Promise.all(BG_CONFIG.map((cfg) => fetchColored(cfg.file, colorMap[cfg.colorKey]))),
            // Card decorators (prototype: 2-60-30 → c1, 1-80-75 → c2, both 34 px)
            fetchColored('2-60-30.svg', tk.c1),
            fetchColored('1-80-75.svg', tk.c2),
        ]);

        this.illustrativeSvgs.bgItems = BG_CONFIG
            .map((cfg, i) => bgResults[i] ? { html: bgResults[i], cx: cfg.cx, cy: cfg.cy, w: cfg.w, anim: cfg.anim, dur: cfg.dur } : null)
            .filter(Boolean);
        this.illustrativeSvgs.cardLeft  = cardLeft;
        this.illustrativeSvgs.cardRight = cardRight;
    }

    // ── Style token helpers ────────────────────────────────────────────────────

    get _colors() {
        return this.state.selectedStyle?.colors ||
            ['#875A7B', '#c4cbd2', '#e9e9e9', '#f4f6f8', '#1A222B'];
    }

    get styleTokens() {
        const [c1, c2, c3, c4, c5] = this._colors;
        const s = this.state.selectedStyle;
        return {
            c1, c2, c3, c4, c5,
            // Actual compiled header/footer background colours from the palette's
            // CC index.  Fall back to palette colors c4/c3 when not yet loaded.
            menuBg:         s?.menuBg         || c4,
            footerBg:       s?.footerBg       || c3,
            radius:         s?.radius         || '0.5rem',
            fontHead:       s?.fontHead       || 'Plus Jakarta Sans',
            fontBody:       s?.fontBody       || 'Plus Jakarta Sans',
            fontHeadWeight: s?.fontHeadWeight || '700',
        };
    }

    // ── Inline-style builders (called from t-att-style in the template) ────────

    /**
     * CSS for the full-screen background panel of a given vibe.
     * The method is called once per vibe layer in the template so all 6 are
     * rendered simultaneously; opacity controls which one is visible.
     */
    bgLayerStyle(vibeId) {
        const pk = this.pickedVibe.value;
        const active = pk ? pk === vibeId : vibeId === 'clean'; // default → clean
        return `position:absolute;inset:0;transition:opacity .4s ease;opacity:${active ? 1 : 0};pointer-events:${active ? 'auto' : 'none'}`;
    }

    /** CSS for the image stripe shared by most vibe backgrounds. */
    bgImageStyle() {
        const url = this.industryImageUrl.value;
        return `position:absolute;top:60px;left:0;right:0;height:50%;` +
               `background:url('${url}') center/cover no-repeat;`;
    }

    /** CSS for the top navbar stripe. */
    bgNavStyle(extraCss = '') {
        // Use the palette's actual menu CC background colour (resolved from the
        // 'menu' key in the palette, defaulting to CC1 = body bg when omitted).
        const { menuBg } = this.styleTokens;
        return `position:absolute;top:0;left:0;right:0;height:60px;background:${menuBg};${extraCss}`;
    }

    /** CSS for the bottom content stripe. */
    bgFootStyle(extraCss = '') {
        // Use the palette's actual footer CC background colour (resolved from
        // the 'footer' key in the palette, defaulting to CC2 when omitted).
        const { footerBg } = this.styleTokens;
        return `position:absolute;bottom:0;left:0;right:0;height:45%;background:${footerBg};${extraCss}`;
    }

    /** CSS for the gradient overlay used by gradient/playful. */
    bgGradientOverlayStyle() {
        const { c1, c2 } = this.styleTokens;
        return `position:absolute;inset:0;pointer-events:none;` +
               `background:radial-gradient(at 85% 25%,${c1}bb 0%,transparent 50%),` +
               `radial-gradient(at 15% 75%,${c2}aa 0%,transparent 50%),` +
               `radial-gradient(at 70% 60%,${c2}66 0%,transparent 45%);`;
    }

    /** CSS for the floating content panel (glass effect for glossy). */
    contentPanelStyle() {
        const pk = this.pickedVibe.value;
        const { c4 } = this.styleTokens;
        if (pk === 'glossy') {
            return 'background:linear-gradient(135deg,#ffffff8f 0%,#ffffff70 100%);' +
                   'backdrop-filter:contrast(110%) blur(3px);' +
                   '-webkit-backdrop-filter:contrast(110%) blur(3px);' +
                   'border:2px solid #fff;';
        }
        if (pk === 'illustrative') {
            return 'background:transparent;border:none;';
        }
        return `background:${c4};`;
    }

    /** Inline style for a single vibe card (uses palette + active state). */
    vibeCardInlineStyle(vibeId) {
        const { c1, c2, c3, c4, radius, fontHead, fontHeadWeight } = this.styleTokens;
        const isDark = isColorDark(c4);
        const isActive = this.pickedVibe.value === vibeId;

        let bg, color, blur = false;
        switch (vibeId) {
            case 'clean':
                bg = c4; color = readableOn(c4); break;
            case 'dynamic':
                bg = `linear-gradient(45deg,${c4}99 50%,${c3}88 50.1%)`;
                color = readableOn(c3); break;
            case 'gradient':
                bg = `radial-gradient(ellipse at 15% 25%,${c1}99 0%,transparent 55%),` +
                     `radial-gradient(ellipse at 85% 75%,${c2}88 0%,transparent 55%),${c4}`;
                color = readableOn(c4); break;
            case 'glossy':
                bg = isDark ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.55)';
                color = isDark ? '#fff' : '#111'; blur = true; break;
            case 'illustrative':
                bg = c4; color = readableOn(c4); break;
            case 'playful':
                bg = `radial-gradient(ellipse at 15% 25%,${c1}99 0%,transparent 55%),` +
                     `radial-gradient(ellipse at 85% 75%,${c2}88 0%,transparent 55%),${c4}`;
                color = readableOn(c4); break;
            default:
                bg = c3; color = readableOn(c3);
        }

        const borderColor = isActive ? c1 : `${color}33`;
        const shadow = isActive
            ? `0 0 0 2.5px ${c1},0 8px 24px ${c1}44`
            : 'none';

        return [
            `background:${bg}`,
            `color:${color}`,
            `border-color:${borderColor}`,
            `border-radius:${radius}`,
            `box-shadow:${shadow}`,
            `font-family:'${fontHead}',serif`,
            `font-weight:${fontHeadWeight}`,
            blur ? 'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)' : '',
        ].filter(Boolean).join(';') + ';';
    }

    likeItBtnStyle() {
        const { c1, fontBody, radius } = this.styleTokens;
        return `background:${c1};color:${readableOn(c1)};` +
               `border-radius:${radius};font-family:'${fontBody}',sans-serif;`;
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    selectVibe(vibeId) {
        this.pickedVibe.value = vibeId;
        // Same prefetch path used eagerly on mount; idempotent for the
        // already-warmed vibe and acts as a safety net if the eager pass
        // hadn't started yet (e.g. industry changed between mounts).
        this._prefetchVibe(vibeId);
    }

    confirmVibe() {
        const vibe = VIBES.find(v => v.id === this.pickedVibe.value);
        if (!vibe) return;
        this.state.selectedVibe = vibe;
        this.props.navigate(ROUTES.layoutSelectionScreen);
    }

    // kept for potential external use
    getSelectedVibeId() {
        return this.pickedVibe.value;
    }
}


export class ApplyConfiguratorScreen extends Component {
    static template = "";
    static props = ["*"];
    setup() {
        this.websiteService = useService("website");
        this.configuratorProgress = 0;
    }

    async applyConfigurator(themeName) {
        if (!this.state.selectedIndustry) {
            return this.props.navigate(ROUTES.descriptionScreen);
        }

        const attemptConfiguratorApply = async (data, retryCount = 0) => {
            try {
                return await this.orm.silent.call("website", "configurator_apply", [], data);
            } catch (error) {
                // Wait a bit before retrying or allowing manual retry.
                await delay(5000);
                if (retryCount < 3) {
                    return attemptConfiguratorApply(data, retryCount + 1);
                }
                document.querySelector(".o_website_loader_container").remove();
                throw error;
            }
        };

        if (themeName !== undefined) {
            const selectedFeatures = Object.values(this.state.features)
                .filter((feature) => feature.selected)
                .map((feature) => feature.id);
            const loadingSteps = [
                {
                    description: _t("Applying your colors and design..."),
                    flag: "colors",
                },
                {
                    description: _t("Searching your images..."),
                    flag: "images",
                },
                {
                    description: _t("Generating inspiring text..."),
                    flag: "text",
                },
                ...this.getSelectedFeaturesLoadingSteps(selectedFeatures),
                {
                    title: _t("Finalizing."),
                    description: _t("Activating the last features."),
                    flag: "generic",
                },
            ];

            // Server requests are locked during module installation,
            // uninstallation, or upgrade (when running without `workers`), so
            // real-time progress can't be fetched. We simulate it instead.
            const stopProgressSimulation = this.startConfiguratorProgressSimulation(
                selectedFeatures.length
            );
            this.websiteService.showLoader({
                title: _t("Building your website."),
                loadingSteps,
                getProgress: () => this.configuratorProgress,
                bottomMessageTemplate: "website.website_loader.tour_tip",
            });
            // Use the style id (e.g. 'soft-04') as the palette identifier —
            // NOT the translated display name ('Golden Hour') which would make
            // the server-side SCSS compilation fail with transparent colors.
            const selectedStyleId = this.state.selectedStyle?.id || null;
            const resp = await attemptConfiguratorApply(
                this.getConfigurationData(selectedFeatures, selectedStyleId, themeName)
            );

            this.props.clearStorage();
            stopProgressSimulation();

            this.websiteService.redirectOutFromLoader({
                redirectAction: () => {
                    // Here, the website service `goToWebsite` method is not
                    // used because the web client needs to be reloaded after
                    // the new modules have been installed.
                    redirect(
                        `/odoo/action-website.website_preview?website_id=${encodeURIComponent(
                            resp.website_id
                        )}`
                    );
                },
            });
        }
    }

    getConfigurationData(selectedFeatures, selectedStyleId, themeName) {
        const style = this.state.selectedStyle;
        const layoutId = this.state.selectedLayout?.id || 'minimalist';
        // Layout config comes from the server-returned preview data (populated when
        // layout previews were fetched).  Falls back to safe defaults so that fast
        // navigation (e.g. user clicks through without waiting for previews) still
        // produces a valid website.
        // Use (state.layoutConfigs || {}) to guard against session-storage restores
        // where the non-serialised layoutConfigs key is absent from state.
        const cfg = (this.state.layoutConfigs || {})[layoutId] || {
            headerTemplate: 'template_header_default',
            footerTemplate: 'footer_custom',
            headerCc: 1,
            footerCc: 2,
            headerOverlay: false,
            headerFullWidth: false,
            headerBg: '',
            headerBorder: '',
            headerShadow: '',
            headerTextColor: '',
            footerBg: '',
        };
        return {
            selected_features: selectedFeatures,
            industry_id: this.state.selectedIndustry.id,
            industry_name: this.state.selectedIndustry.label.toLowerCase(),
            // selected_style / selected_palette: the CSS palette id (e.g. 'soft-04'),
            // used by configurator_apply to reliably re-apply the SCSS variables even
            // in fast-click / skip scenarios where the async JS compilation may not
            // have finished.  We MUST send the id, not the translated display name.
            // Named premade styles send their palette id (str); user-generated
            // styles send the 5-colour list, which configurator_apply persists
            // via the custom-palette path (user_color_palette.scss).
            selected_style: style?.userGenerated ? style.colors : selectedStyleId,
            selected_palette: style?.userGenerated ? style.colors : selectedStyleId,
            // Font + radius values so the server can re-apply the full style if needed.
            selected_headings_font: style?.fontHead || null,
            selected_body_font: style?.fontBody || null,
            selected_btn_radius: style?.radius || null,
            // Display-N typography baseline (per-style overrides + defaults).
            // Server writes these into user_values.scss alongside the palette
            // and fonts so the persisted website matches the preview exactly.
            selected_display_tokens: style ? getDisplayTokens(style) : {},
            selected_vibe: this.state.selectedVibe?.id,
            selected_layout: layoutId,
            selected_header_template: cfg.headerTemplate,
            selected_footer_template: cfg.footerTemplate,
            selected_header_cc: cfg.headerCc,
            selected_footer_cc: cfg.footerCc,
            selected_header_overlay: cfg.headerOverlay,
            selected_header_full_width: cfg.headerFullWidth,
            // Hardcoded header/footer style overrides (persisted as the same
            // SCSS user-values the post-creation theme editor uses).
            selected_header_bg: cfg.headerBg || null,
            selected_header_border: cfg.headerBorder || null,
            selected_header_shadow: cfg.headerShadow || null,
            selected_header_text_color: cfg.headerTextColor || null,
            selected_footer_bg: cfg.footerBg || null,
            theme_name: themeName,
            website_purpose:
                this.state.selectedPositioning || this.state.formerSelectedPositioning ||
                WEBSITE_PURPOSES[this.state.selectedPurpose || this.state.formerSelectedPurpose]?.name ||
                "general",
            website_type: WEBSITE_TYPES[this.state.selectedType].name,
            logo_attachment_id: this.state.logoAttachmentId,
        };
    }

    /**
     * Simulates the progress for website creation, divided into three phases:
     * 1. Initial Phase (0-30%): Fast progress to give the impression of quick
     *    processing.
     * 2. Modules Phase (30-90%): Distributes progress evenly across the
     *    selected features (modules).
     * 3. Final Phase (90-100%): Slow progress to allow any pending operations
     *    to complete before reaching 100%.
     *
     * @param {number} selectedFeaturesCount - Number of features to simulate
     *                                         progress for.
     * @returns {Function} A cleanup function that stops the simulation.
     */
    startConfiguratorProgressSimulation(selectedFeaturesCount) {
        const INITIAL_PHASE_END = 30;
        const MODULES_PHASE_END = 90;

        const moduleCount = Math.max(1, selectedFeaturesCount);
        const progressPerModule = (MODULES_PHASE_END - INITIAL_PHASE_END) / moduleCount;

        let progress = 0;
        let phase = "initial";

        const intervalId = setInterval(() => {
            switch (phase) {
                case "initial":
                    progress += 2;
                    if (progress >= INITIAL_PHASE_END) {
                        phase = "modules";
                    }
                    break;

                case "modules": {
                    const moduleProgress = (progress - INITIAL_PHASE_END) % progressPerModule;
                    // Gradually reduce speed within each module so the modules
                    // phase gets adequate time while keeping progression evenly
                    // distributed.
                    const ratio = clamp(moduleProgress / progressPerModule, 0, 1);
                    const speed = 1.5 + (0.2 - 1.5) * ratio;

                    progress = Math.min(progress + speed, MODULES_PHASE_END);
                    if (progress >= MODULES_PHASE_END) {
                        phase = "final";
                    }
                    break;
                }

                case "final":
                    progress = Math.min(progress + 0.05, 100);
                    break;
            }

            this.configuratorProgress = progress;
        }, 500);

        return () => clearInterval(intervalId);
    }

    /**
     * Returns the list of feature steps with their loading messages.
     * Each step maps to a `website.configurator.feature` record ID.
     *
     * @returns {Object[]} Array of feature step definitions.
     */
    get featureSteps() {
        return [
            {
                id: 5,
                title: _t("Adding features."),
                name: _t("blog"),
                description: _t("Enabling your %s."),
                flag: "generic",
            },
            {
                id: 7,
                title: _t("Adding features."),
                name: _t("recruitment platform"),
                description: _t("Integrating your %s."),
                flag: "generic",
            },
            {
                id: 8,
                title: _t("Adding features."),
                name: _t("online store"),
                description: _t("Activating your %s."),
                flag: "generic",
            },
            {
                id: 9,
                title: _t("Adding features."),
                name: _t("online appointment system"),
                description: _t("Configuring your %s."),
                flag: "generic",
            },
            {
                id: 10,
                title: _t("Adding features."),
                name: _t("forum"),
                description: _t("Setting up your %s."),
                flag: "generic",
            },
            {
                id: 12,
                title: _t("Adding features."),
                name: _t("e-learning platform"),
                description: _t("Installing your %s."),
                flag: "generic",
            },
        ];
    }

    /**
     * Depending on the features selected, returns the right loading steps.
     *
     * @param {number[]} [selectedFeatures=[]]
     * @returns {Object[]} The loading steps filtered by the selected features.
     */
    getSelectedFeaturesLoadingSteps(selectedFeatures = []) {
        return this.featureSteps
            .filter((step) => selectedFeatures.includes(step.id))
            .map((step) => {
                const highlight = markup`<span class="o_website_loader_text_highlight">${step.name}</span>`;
                return { ...step, description: htmlSprintf(step.description, highlight) };
            });
    }
}

export class LayoutSelectionScreen extends ApplyConfiguratorScreen {
    static template = "website.Configurator.LayoutSelectionScreen";
    static components = { SkipButton, LayoutPreviewHost, StyleVibeDropdowns };
    static props = ["navigate", "skip", "clearStorage", { back: { type: Function, optional: true } }];
    setup() {
        super.setup();
        this.uiService = useService("ui");
        this.orm = useService("orm");
        this.state = useStore();
        this.layouts = LAYOUTS;
        this.layoutPreviews = proxy({ html: {} });
        // Raw normalised HTML per layout (no markup() wrapper) kept so that
        // _watchHeadings() can re-apply the heading map without having to parse
        // back out of a Markup object.
        this._rawLayoutHtml = {};
        // Guard used by _watchHeadings to avoid calling _applyHeadingsToCards on
        // an already-unmounted component instance (the AI promise may settle after
        // the user navigates to the preview screen).
        this._isDestroyed = false;

        // ── Visual selection state (card lights up before navigation) ────────
        this._selectedLayout = proxy({ value: null });

        // ── Viewport-based scale for layout preview cards (mirrors Step 7) ──
        // Measures the actual rendered card width so that each preview always
        // equals 1280px of content regardless of the viewport size.
        this.previewGridRef = useRef("previewGrid");
        this.layoutScale = proxy({ value: 1 });

        useExternalListener(window, "resize", () => this._updateLayoutScale());
        // Re-measure whenever the loading state changes (cards enter the DOM
        // when isLoadingPreviews flips from true → false).
        useLayoutEffect(
            () => {
                if (!this.isLoadingPreviews.value) {
                    this._updateLayoutScale();
                }
            },
            () => [this.isLoadingPreviews.value]
        );

        // ── Fast-path: check if prefetch resolved, SCSS is done, AND bundles loaded ─
        // All three conditions must hold to skip the spinner:
        //   1. The prefetch promise for this vibe+industry resolved.
        //   2. No SCSS compilation is pending.
        //   3. The website CSS bundle has been loaded (reloadBundles done).
        //      If bundles haven't been loaded yet, cards would appear with wrong
        //      fonts / colours (the website CSS isn't in the page yet), causing
        //      a visible ~1s flicker once the bundle swap arrives.
        const vibeId = this.state.selectedVibe?.id || "clean";
        const industryId = this.state.selectedIndustry?.id ?? null;
        const positioning = this.state.selectedPositioning || this.state.formerSelectedPositioning || "";
        const instantResult = getResolvedLayoutPreviews(vibeId, industryId);
        // skipLoader = true  → render cards immediately, no spinner, no fade-in
        // skipLoader = false → show spinner, fetch (or await cache), then render
        const skipLoader = !!instantResult && _pendingStyleCustomizationDone && _bundleReloadDone;


        // Plain (non-reactive) flag read by the template to suppress animations.
        this.skipAnimation = skipLoader;
        this.isLoadingPreviews = proxy({ value: !skipLoader });

        if (skipLoader) {
            // Pre-populate synchronously — first render will show cards directly.
            // instantResult is already normalized (normalizePreviewHtml was called
            // inside prefetchLayoutPreviews' .then() callback at industry-selection
            // time), so just wrap with markup() here.
            // Apply AI-adapted headings if they are already resolved (very likely
            // when skipLoader is true: the user spent time on steps 3 and 4).
            const headingMap = getResolvedHeadings(industryId, positioning) || {};
            const markedPreviews = {};
            for (const [k, v] of Object.entries(instantResult)) {
                // v is { html, headerTemplate, footerTemplate, headerCc, footerCc }
                // (normalised by prefetchLayoutPreviews).
                const rawHtml = extractPreviewHtml(v);
                this._rawLayoutHtml[k] = rawHtml || "";
                this.state.layoutConfigs[k] = extractLayoutConfig(v);
                const adapted = rawHtml ? applyAdaptedHeadings(rawHtml, headingMap) : "";
                markedPreviews[k] = adapted ? markup(adapted) : "";
            }
            this.layoutPreviews.html = markedPreviews;
        }

        onWillUnmount(() => {
            this._isDestroyed = true;
        });

        onMounted(async () => {
            // bundleChain: ensure the website CSS bundle is current before cards
            // are shown.
            //   • If a proactive reload was started in selectStyle().then(), we
            //     await that shared promise (no double-reload).
            //   • If bundles haven't been loaded at all yet (first visit, no style
            //     selected), we kick off a fresh reloadBundles() now.
            //   • If bundles are already current (_bundleReloadDone), this is a
            //     no-op — avoids the flicker caused by removing/re-adding CSS links.
            //
            // The in-flight SCSS promise is captured into a local variable BEFORE
            // awaiting it.  The finally block only nulls the module-level reference
            // when it still points to the same promise — otherwise a style change
            // that starts a new compilation while this one is awaiting would have
            // its reference silently cleared.
            const bundleChain = (async () => {
                const scssPromise = _pendingStyleCustomization;
                if (scssPromise) {
                    try {
                        await scssPromise;
                    } catch (_e) { /* SCSS failed, continue */ }
                    finally {
                        if (_pendingStyleCustomization === scssPromise) {
                            _pendingStyleCustomization = null;
                        }
                    }
                }
                if (_pendingBundleReload) {
                    // Proactive reload in-flight from selectStyle().then() — await it.
                    try { await _pendingBundleReload; } catch (_e) { /* ignore */ }
                } else if (!_bundleReloadDone) {
                    // First visit with no style change: load the website CSS bundle now.
                    try { await reloadBundles(); _bundleReloadDone = true; }
                    catch (_e) { _bundleReloadDone = true; }
                }
                // If _bundleReloadDone is already true, no reload needed — bundles current.
            })();

            if (skipLoader) {
                // Cards are already showing with correct CSS.
                // bundleChain should be a fast no-op (_bundleReloadDone is true),
                // but fire it anyway as a safety net.
                bundleChain; // intentionally not awaited
                // Release preload Image refs — bitmaps are now on GPU, no longer
                // need to be kept alive in JS memory.
                _preloadedImageRefs.length = 0;
                // Headings may not have settled yet (AI call was still in-flight).
                // Watch for them and update cards reactively when they arrive.
                this._watchHeadings(industryId, positioning);
                return;
            }

            // Normal path: fetch previews in parallel with SCSS + bundle reload.
            // Headings are awaited as well — but only if the cache already has the
            // promise.  If it doesn't (extremely fast navigation), we fall back to
            // an empty map and set up _watchHeadings to patch later.
            const previewsPromise =
                getCachedLayoutPreviews(vibeId, industryId) ||
                rpc("/website/configurator/get_layout_previews", {
                    vibe: vibeId,
                    industry_id: industryId,
                });
            const cachedHeadings$ = getCachedHeadings(industryId, positioning);

            // [Configurator] LayoutSelectionScreen: awaiting previews + bundle + headings
            const [previews, , headingMap] = await Promise.all([
                previewsPromise.catch(() => ({})),
                bundleChain,
                (cachedHeadings$ || Promise.resolve({})).catch(() => ({})),
            ]);

            const markedPreviews = {};
            for (const [k, v] of Object.entries(previews)) {
                // v is now { html, headerTemplate, footerTemplate, headerCc, footerCc }
                // (or a plain string for backward compatibility)
                const rawHtml = extractPreviewHtml(v);
                const norm = rawHtml ? normalizePreviewHtml(rawHtml) : "";
                this._rawLayoutHtml[k] = norm;
                const adapted = norm ? applyAdaptedHeadings(norm, headingMap) : "";
                markedPreviews[k] = adapted ? markup(adapted) : "";
                // Store per-layout config so getConfigurationData() can read it
                // without maintaining a separate parallel dict.
                (this.state.layoutConfigs ||= {})[k] = extractLayoutConfig(v);
            }
            this.layoutPreviews.html = markedPreviews;
            this.isLoadingPreviews.value = false;

            // If headings weren't in the cache (empty fallback) or returned empty,
            // set up a watcher in case the prefetch resolves after we're already showing.
            if (!cachedHeadings$ || !Object.keys(headingMap).length) {
                this._watchHeadings(industryId, positioning);
            }
        });
    }

    // Re-populate layoutPreviews.html from _rawLayoutHtml + a heading map.
    _applyHeadingsToCards(headingMap) {
        if (!headingMap || !Object.keys(headingMap).length) return;
        if (!Object.keys(this._rawLayoutHtml).length) return;
        const updated = {};
        for (const [k, v] of Object.entries(this._rawLayoutHtml)) {
            const adapted = v ? applyAdaptedHeadings(v, headingMap) : "";
            updated[k] = adapted ? markup(adapted) : "";
        }
        this.layoutPreviews.html = updated;
    }

    /**
     * Attach a background `.then()` to the heading prefetch promise.  When it
     * resolves, patch layoutPreviews.html so the adapted text appears without
     * the user having to navigate away and back.  No-op if the cache entry is
     * already resolved (getResolvedHeadings returned a value synchronously) or
     * if there is no matching cache entry at all.
     *
     * @param {number|null} industryId
     * @param {string}      positioning
     */
    _watchHeadings(industryId, positioning) {
        // Nothing to watch if already applied synchronously.
        if (getResolvedHeadings(industryId, positioning)) return;
        const headings$ = getCachedHeadings(industryId, positioning);
        if (!headings$) return;
        headings$
            .then((headingMap) => {
                // The user may have navigated to the preview screen (or back) while
                // the AI round-trip was in flight.  _isDestroyed is set to true in
                // onWillUnmount, so we skip the update to avoid mutating the state
                // of an unmounted component instance.
                if (!this._isDestroyed) {
                    this._applyHeadingsToCards(headingMap);
                }
            })
            .catch(() => {});
    }

    // ── Layout-card scale helpers (mirrors PreviewScreen / Step 7) ───────────

    /**
     * Measure the rendered width of a single layout-preview card and derive
     * the scale factor needed to render 1280px of website content inside it.
     * Called on mount (after cards enter the DOM) and on every window resize.
     */
    _updateLayoutScale() {
        const gridEl = this.previewGridRef.el;
        // Measure the first rendered card's preview area width.
        const wrapperEl = gridEl?.querySelector(".o_layout_preview_wrap");
        if (wrapperEl) {
            this.layoutScale.value = wrapperEl.offsetWidth / PREVIEW_FULL_WIDTH;
        }
    }

    get _layoutPreviewHostStyle() {
        return previewHostStyle(this.layoutScale.value);
    }

    chooseLayout(layoutId) {
        // Prevent double-click or re-selecting while navigation is pending.
        if (this._selectedLayout.value) return;
        this._selectedLayout.value = layoutId;
        this.state.selectedLayout = LAYOUTS.find((l) => l.id === layoutId);
        if (!this._isDestroyed) {
            this.props.navigate(ROUTES.previewScreen);
        }
    }

    // Re-fetch + re-render the 6-up grid for the current vibe/industry.
    // Mirrors the normal path in onMounted (kept separate so the delicate
    // fast-path there is untouched).
    async _reloadLayoutGrid() {
        const vibeId = this.state.selectedVibe?.id || "clean";
        const industryId = this.state.selectedIndustry?.id ?? null;
        const positioning =
            this.state.selectedPositioning || this.state.formerSelectedPositioning || "";
        this.isLoadingPreviews.value = true;
        const previews = await (
            getCachedLayoutPreviews(vibeId, industryId) ||
            rpc("/website/configurator/get_layout_previews", {
                vibe: vibeId,
                industry_id: industryId,
            })
        ).catch(() => ({}));
        const headingMap =
            (await (getCachedHeadings(industryId, positioning) || Promise.resolve({})).catch(
                () => ({})
            )) || {};
        const markedPreviews = {};
        for (const [k, v] of Object.entries(previews)) {
            const rawHtml = extractPreviewHtml(v);
            const norm = rawHtml ? normalizePreviewHtml(rawHtml) : "";
            this._rawLayoutHtml[k] = norm;
            const adapted = norm ? applyAdaptedHeadings(norm, headingMap) : "";
            markedPreviews[k] = adapted ? markup(adapted) : "";
            (this.state.layoutConfigs ||= {})[k] = extractLayoutConfig(v);
        }
        this.layoutPreviews.html = markedPreviews;
        this.isLoadingPreviews.value = false;
    }

    async onStyleChange(styleId) {
        // HTML is style-independent; reloadBundles() inside applyStyleChange
        // hot-swaps the CSS in every grid preview's shadow root.
        await applyStyleChange(this.orm, this.state, styleId);
    }

    async onVibeChange(vibeId) {
        const vibe = VIBES.find((v) => v.id === vibeId);
        if (!vibe) return;
        this.state.selectedVibe = vibe;
        const industryId = this.state.selectedIndustry?.id ?? null;
        prefetchLayoutPreviews(industryId, vibe.id);
        await this._reloadLayoutGrid();
    }
}

export class PreviewScreen extends ApplyConfiguratorScreen {
    static template = "website.Configurator.PreviewScreen";
    static components = { SkipButton, LayoutPreviewHost, StyleVibeDropdowns };
    static props = ["navigate", "skip", "clearStorage", { back: { type: Function, optional: true } }];

    setup() {
        super.setup();
        this.orm = useService("orm");
        this.state = useStore();
        this.previewHtml = proxy({ value: markup("") });
        this.isLoading = proxy({ value: true });

        // ── Scale computation (matches prototype step 4) ─────────────────────
        this.previewRef = useRef("previewBox");
        this.scale = proxy({ value: 1 });

        // ── Window resize → update scale ─────────────────────────────────────
        useExternalListener(window, "resize", () => this._updateScale());

        onMounted(async () => {
            this._updateScale();
            await this._loadPreview();
        });
    }

    // ── Scale helpers ─────────────────────────────────────────────────────────

    _updateScale() {
        const el = this.previewRef.el;
        if (el) this.scale.value = el.offsetWidth / PREVIEW_FULL_WIDTH;
    }

    get _previewInnerStyle() {
        return previewHostStyle(this.scale.value);
    }

    // ── Data loading ──────────────────────────────────────────────────────────

    async _loadPreview() {
        this.isLoading.value = true;
        const vibeId = this.state.selectedVibe?.id || "clean";
        const layoutId = this.state.selectedLayout?.id || "minimalist";
        const industryId = this.state.selectedIndustry?.id ?? null;
        const positioning = this.state.selectedPositioning || this.state.formerSelectedPositioning || "";
        const industryLabel = this.state.selectedIndustry?.label || "";
        try {
            // Reuse prefetch cache when vibe and industry match (common case:
            // user stayed on "clean" vibe and navigated straight to preview).
            const previewsPromise =
                getCachedLayoutPreviews(vibeId, industryId) ||
                rpc("/website/configurator/get_layout_previews", {
                    vibe: vibeId,
                    industry_id: industryId,
                });
            const headingsPromise =
                getCachedHeadings(industryId, positioning) || Promise.resolve({});
            const [previews, baseHeadingMap] = await Promise.all([
                previewsPromise,
                headingsPromise.catch(() => ({})),
            ]);
            const entry = previews[layoutId];
            // Store the layout config so getConfigurationData() uses the right
            // template/CC when the user hits "Let's do it!".
            if (entry && typeof entry === "object") {
                this.state.layoutConfigs[layoutId] = extractLayoutConfig(entry);
            }
            const html = extractPreviewHtml(entry);

            // ── Vibe-specific supplemental heading adaptation ─────────────────
            // If the vibe's xpath changed some heading words (not just decorations),
            // their plain text won't appear as keys in the base headingMap.  Detect
            // those and fire (or reuse) a supplemental AI call for them, then merge
            // the result before applying.
            let headingMap = baseHeadingMap;
            if (vibeId !== "clean" && html) {
                const missingTexts = findUnmatchedHeadings(html, baseHeadingMap);
                if (missingTexts.length) {
                    // Start the supplemental prefetch if not already in-flight.
                    prefetchVibeHeadings(vibeId, industryId, positioning, missingTexts, industryLabel);
                    const vibeMap = await getCachedVibeHeadings(vibeId, industryId, positioning).catch(() => ({}));
                    if (vibeMap && Object.keys(vibeMap).length) {
                        headingMap = { ...baseHeadingMap, ...vibeMap };
                    }
                }
            }

            // Step 6 full preview: keep the template intact — do NOT strip
            // parallax classes (the CSS `.parallax > .s_parallax_bg_wrap` rule
            // must stay active so the background image is sized correctly).
            const adapted = applyAdaptedHeadings(html, headingMap);
            this.previewHtml.value = adapted ? markup(normalizePreviewHtml(adapted)) : markup("");
        } catch (_e) {
            // preview load failed
        }
        this.isLoading.value = false;
    }

    async onStyleChange(styleId) {
        // No _loadPreview() afterwards: the preview HTML is style-independent;
        // reloadBundles() (inside applyStyleChange) hot-swaps the stylesheets
        // and busts shape URLs in every shadow root.
        await applyStyleChange(this.orm, this.state, styleId);
    }

    async onVibeChange(vibeId) {
        const vibe = VIBES.find((v) => v.id === vibeId);
        if (!vibe) return;
        this.state.selectedVibe = vibe;
        await this._loadPreview();
    }

    get pageFeatures() {
        return this.state.getFeatures().filter((f) => f.type === "page");
    }

    get serviceFeatures() {
        return this.state.getFeatures().filter((f) => f.type === "app");
    }

    toggleFeature(featureId) {
        this.state.toggleFeature(featureId);
    }

    async confirm() {
        await this.applyConfigurator("theme_default");
    }
}

//------------------------------------------------------------------------------
// Store — reactive data model shared across all configurator screens
//------------------------------------------------------------------------------

export class Store {
    async start(getInitialState) {
        Object.assign(this, await getInitialState());
    }

    getWebsiteTypes() { return Object.values(WEBSITE_TYPES); }
    getSelectedType(id) { return id && WEBSITE_TYPES[id]; }
    getWebsitePurpose() { return Object.values(WEBSITE_PURPOSES); }
    getSelectedPurpose(id) { return id && WEBSITE_PURPOSES[id]; }
    getFeatures() { return Object.values(this.features); }
    getPalettes() { return Object.values(this.palettes || {}); }

    selectWebsiteType(id) {
        Object.values(this.features)
            .filter((feature) => feature.module_state !== "installed")
            .forEach((feature) => {
                feature.selected = feature.website_config_preselection.includes(WEBSITE_TYPES[id].name);
            });
        this.selectedType = id;
    }

    selectWebsitePurpose(id) {
        if (!id && this.selectedPurpose) { this.formerSelectedPurpose = this.selectedPurpose; }
        Object.values(this.features)
            .filter((feature) => feature.module_state !== "installed")
            .forEach((feature) => {
                feature.selected |= id && feature.website_config_preselection.includes(WEBSITE_PURPOSES[id].name);
            });
        this.selectedPurpose = id;
    }

    selectPositioning(positioning) {
        if (!positioning && this.selectedPositioning) { this.formerSelectedPositioning = this.selectedPositioning; }
        this.selectedPositioning = positioning;
    }

    selectIndustry(label, id) {
        if (!label || !id) { this.selectedIndustry = undefined; }
        else { this.selectedIndustry = { id, label }; }
    }

    changeLogo(data, attachmentId) {
        this.logo = data;
        this.logoAttachmentId = attachmentId;
        if (!data) {
            // Logo removed → drop the derived palette and any selected
            // user-generated style so the UI falls back to premade styles.
            this.recommendedColors = undefined;
            if (this.selectedStyle && this.selectedStyle.userGenerated) {
                this.selectedStyle = undefined;
            }
        }
    }

    /**
     * Store the 5-colour palette derived from the two logo-extracted colours.
     * Pass no/empty colours to clear it.
     */
    setRecommendedColors(color1, color2) {
        this.recommendedColors = (color1 && color2)
            ? buildUserPaletteColors(color1, color2)
            : undefined;
    }

    toggleFeature(featureId) {
        const feature = this.features[featureId];
        const isModuleInstalled = feature.module_state === "installed";
        feature.selected = !feature.selected || isModuleInstalled;
    }
}

export function useStore() {
    const env = useEnv();
    return proxy(env.store);
}

//------------------------------------------------------------------------------
// Root Configurator component
//------------------------------------------------------------------------------

export class Configurator extends Component {
    static components = {
        WelcomeScreen,
        DescriptionScreen,
        StyleSelectionScreen,
        VibeSelectionScreen,
        LayoutSelectionScreen,
        PreviewScreen,
    };
    static template = "website.Configurator.Configurator";
    static props = { ...standardActionServiceProps };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.website = useService("website");
        loadGoogleFonts();
        // Illustrative SVGs are industry-independent — start fetching raw text
        // immediately at Step 1 so the files are browser-cached by the time the
        // user reaches the Vibe selection screen (Step 4).
        prefetchIllustrativeSvgs();

        useExternalListener(window, "popstate", (ev) => {
            if (ev.state && "configuratorStep" in ev.state) {
                this.state.currentStep = ev.state.configuratorStep;
            }
        });

        const initialStep = router.current.step;
        const store = proxy(new Store());
        let isStoreStarted = false;
        useEffect(() => {
            if (!isStoreStarted) {
                store; // consume signal
                return;
            }
            this.updateStorage(store);
        });

        this.state = proxy({
            currentStep: initialStep,
        });

        useSubEnv({ store });

        onWillStart(async () => {
            this.websiteId = (await this.orm.call("website", "get_current_website"))[0];
            await store.start(() => this.getInitialState());
            this.updateStorage(store);
            isStoreStarted = true;
            if (!store.industries || store.configurator_done) {
                await this.skipConfigurator();
            }
        });

        onMounted(() => {
            setTimeout(() => { router.cancelPushes(); this.updateBrowserUrl(); });
        });
    }

    get pathname() {
        return `/website/configurator${this.state.currentStep ? `/${encodeURIComponent(this.state.currentStep)}` : ""}`;
    }

    get storageItemName() { return `websiteConfigurator${this.websiteId}`; }

    updateBrowserUrl() {
        history.pushState({ skipRouteChange: true, configuratorStep: this.state.currentStep }, "", this.pathname);
    }

    get currentComponent() {
        if (this.state.currentStep === ROUTES.descriptionScreen)     return DescriptionScreen;
        if (this.state.currentStep === ROUTES.styleSelectionScreen)  return StyleSelectionScreen;
        if (this.state.currentStep === ROUTES.vibeSelectionScreen)   return VibeSelectionScreen;
        if (this.state.currentStep === ROUTES.layoutSelectionScreen) return LayoutSelectionScreen;
        if (this.state.currentStep === ROUTES.previewScreen)         return PreviewScreen;
        return WelcomeScreen;
    }

    get componentProps() {
        const backSteps = {
            [ROUTES.styleSelectionScreen]:  ROUTES.descriptionScreen,
            [ROUTES.vibeSelectionScreen]:   ROUTES.styleSelectionScreen,
            [ROUTES.layoutSelectionScreen]: ROUTES.vibeSelectionScreen,
            [ROUTES.previewScreen]:         ROUTES.layoutSelectionScreen,
        };
        const props = { skip: this.skipConfigurator.bind(this), navigate: this.navigate.bind(this) };
        const backStep = backSteps[this.state.currentStep];
        if (backStep !== undefined) { props.back = () => this.navigate(backStep); }
        if (this.state.currentStep === ROUTES.layoutSelectionScreen || this.state.currentStep === ROUTES.previewScreen) {
            props.clearStorage = this.clearStorage.bind(this);
        }
        return props;
    }

    navigate(step, reload = false) {
        this.state.currentStep = step;
        if (reload) { redirect(this.pathname); } else { this.updateBrowserUrl(); }
    }

    clearStorage() { sessionStorage.removeItem(this.storageItemName); }

    async getInitialState() {
        var results = await this.orm.call("website", "configurator_init");
        const r = {
            industries: results.industries,
            logo: results.logo ? "data:image/png;base64," + results.logo : false,
            configurator_done: results.configurator_done,
        };
        r.industries = r.industries.map((industry, index) => ({
            ...industry, wordCount: industry.label.split(" ").length, hitCountOrder: index,
        }));

        const palettes = {};
        const localState = JSON.parse(sessionStorage.getItem(this.storageItemName));
        if (localState) {
            return Object.assign(r, {
                positionings: [], positioningsLoading: false,
                selectedPositioning: undefined, formerSelectedPositioning: undefined,
                // layoutConfigs is ephemeral (not serialised) — always start empty.
                layoutConfigs: {},
            }, localState);
        }

        const features = {};
        results.features.forEach((feature) => {
            features[feature.id] = Object.assign({}, feature, { selected: feature.module_state === "installed" });
            const wtp = features[feature.id]["website_config_preselection"];
            features[feature.id]["website_config_preselection"] = wtp ? wtp.split(",") : [];
        });

        return Object.assign(r, {
            selectedType: undefined, selectedPurpose: undefined, formerSelectedPurpose: undefined,
            positionings: [], positioningsLoading: false,
            selectedPositioning: undefined, formerSelectedPositioning: undefined,
            selectedIndustry: undefined, selectedStyle: undefined,
            selectedVibe: undefined, selectedLayout: undefined,
            // Per-layout config populated from server preview response.
            // Maps layoutId → { headerTemplate, footerTemplate, headerCc, footerCc }
            layoutConfigs: {},
            defaultColors: {}, palettes, features, logoAttachmentId: undefined,
            recommendedColors: undefined,
        });
    }

    updateStorage(state) {
        const newState = JSON.stringify({
            features: state.features, logo: state.logo, logoAttachmentId: state.logoAttachmentId,
            recommendedColors: state.recommendedColors,
            selectedIndustry: state.selectedIndustry, selectedStyle: state.selectedStyle,
            selectedVibe: state.selectedVibe, selectedLayout: state.selectedLayout,
            selectedPurpose: state.selectedPurpose, formerSelectedPurpose: state.formerSelectedPurpose,
            selectedPositioning: state.selectedPositioning, formerSelectedPositioning: state.formerSelectedPositioning,
            positionings: state.positionings, selectedType: state.selectedType,
        });
        sessionStorage.setItem(this.storageItemName, newState);
    }

    async skipConfigurator() {
        this.website.showLoader({ title: _t("Building your website."), bottomMessageTemplate: "website.website_loader.tour_tip" });
        const redirectUrl = await this.orm.call("website", "configurator_skip");
        this.clearStorage();
        await this.action.doAction(redirectUrl);
    }
}

registry.category("actions").add("website_configurator", Configurator);
