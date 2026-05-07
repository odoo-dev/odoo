import { _t } from "@web/core/l10n/translation";

// ── Style categories (display labels for the CURATED_STYLES `category` field) ─
export const STYLE_CATEGORIES = {
    'soft':     _t('Soft & Pastel'),
    'elegant':  _t('Elegant & Professional'),
    'vibrant':  _t('Vibrant'),
    'earthy':   _t('Earthy & Nature'),
    'inverted': _t('Dark'),
};

// ── Vibes ─────────────────────────────────────────────────────────────────────
export const VIBES = [
    { id: 'clean',        label: _t('Clean'),        description: _t('Light, airy and uncluttered.') },
    { id: 'dynamic',      label: _t('Dynamic'),      description: _t('Bold shapes and strong motion.') },
    { id: 'gradient',     label: _t('Gradient'),     description: _t('Rich colour transitions.') },
    { id: 'glossy',       label: _t('Glossy'),       description: _t('Polished and luminous surfaces.') },
    { id: 'illustrative', label: _t('Illustrative'), description: _t('Hand-drawn, illustrative feel.') },
    { id: 'playful',      label: _t('Playful 🙂'),      description: _t('Fun, energetic and expressive.') },
];

// ── Layouts ───────────────────────────────────────────────────────────────────
export const LAYOUTS = [
    { id: 'minimalist',   label: _t('Minimalist'),   description: _t('White space, clarity, effortless navigation.') },
    { id: 'bento',        label: _t('Bento'),        description: _t('Modular tiles, easy to scan at a glance.') },
    { id: 'typographic',  label: _t('Typographic'),  description: _t('Bold text as the primary design element.') },
    { id: 'professional', label: _t('Professional'), description: _t('Balanced, polished structure that builds trust.') },
    { id: 'impactful',    label: _t('Impactful'),    description: _t('Full-bleed visuals with editorial boldness.') },
    { id: 'creative',     label: _t('Creative'),     description: _t('Asymmetric, expressive, portrait-led.') },
];

// ── Curated style selection (20 styles matching the configurator prototype) ───
// Only these palette IDs are shown in the style-selection step.
// All per-style design tokens (fonts, weights, radius) are declared here as
// the single source of truth.  Palette colours come from CSS custom props
// (--o-palette-{id}-o-color-{1..5}) which are emitted for every palette by
// color_palettes.scss regardless of which one is currently active.
export const CURATED_STYLES = [
    // Soft & Pastel
    {
        id: 'soft-04',
        category: 'soft',
        name: _t('Golden Hour'),
        desc: _t('Warm & refined'),
        fontHead: 'Cormorant Garamond',
        fontBody: 'Jost',
        fontHeadWeight: '600',
        radius: '0.375rem'
    },
    {
        id: 'soft-07',
        category: 'soft',
        name: _t('Forest Mist'),
        desc: _t('Natural & organic'),
        fontHead: 'Libre Baskerville',
        fontBody: 'Lato',
        fontHeadWeight: '700',
        radius: '0.5rem'
    },
    {
        id: 'soft-11',
        category: 'soft',
        name: _t('Cloud Nine'),
        desc: _t('Clear & structured'),
        fontHead: 'Plus Jakarta Sans',
        fontBody: 'DM Sans',
        fontHeadWeight: '700',
        radius: '0.375rem'
    },
    {
        id: 'soft-14',
        category: 'soft',
        name: _t('Rose Petal'),
        desc: _t('Soft & romantic'),
        fontHead: 'Fraunces',
        fontBody: 'Nunito',
        fontHeadWeight: '700',
        radius: '1rem'
    },
    // Elegant & Professional
    {
        id: 'elegant-01',
        category: 'elegant',
        name: _t('Warm Stone'),
        desc: _t('Timeless & understated'),
        fontHead: 'Instrument Serif',
        fontBody: 'Work Sans',
        fontHeadWeight: '400',
        radius: '0.25rem'
    },
    {
        id: 'elegant-02',
        category: 'elegant',
        name: _t('Steel Blue'),
        desc: _t('Precise & trustworthy'),
        fontHead: 'Manrope',
        fontBody: 'Barlow',
        fontHeadWeight: '700',
        radius: '0.25rem'
    },
    {
        id: 'elegant-06',
        category: 'elegant',
        name: _t('Obsidian Flash'),
        desc: _t('Bold & editorial'),
        fontHead: 'Bebas Neue',
        fontBody: 'DM Mono',
        fontHeadWeight: '400',
        radius: '0'
    },
    {
        id: 'elegant-08',
        category: 'elegant',
        name: _t('Monochrome'),
        desc: _t('Pure & minimal'),
        fontHead: 'Cascadia Code',
        fontBody: 'Work Sans',
        fontHeadWeight: '800',
        radius: '0'
    },
    // Vibrant
    {
        id: 'vibrant-01',
        category: 'vibrant',
        name: _t('Signal Red'),
        desc: _t('High-energy & decisive'),
        fontHead: 'Syne',
        fontBody: 'Barlow',
        fontHeadWeight: '700',
        radius: '0.125rem'
    },
    {
        id: 'vibrant-02',
        category: 'vibrant',
        name: _t('Tropical Punch'),
        desc: _t('Energetic & youthful'),
        fontHead: 'Space Grotesk',
        fontBody: 'Plus Jakarta Sans',
        fontHeadWeight: '700',
        radius: '1.25rem'
    },
    {
        id: 'vibrant-05',
        category: 'vibrant',
        name: _t('Acid Lab'),
        desc: _t('Maximalist & provocative'),
        fontHead: 'Space Grotesk',
        fontBody: 'DM Mono',
        fontHeadWeight: '700',
        radius: '0'
    },
    {
        id: 'vibrant-07',
        category: 'vibrant',
        name: _t('Ocean Drive'),
        desc: _t('Confident & fresh'),
        fontHead: 'Josefin Sans',
        fontBody: 'Manrope',
        fontHeadWeight: '700',
        radius: '0.375rem'
    },
    // Earthy & Nature
    {
        id: 'earthy-02',
        category: 'earthy',
        name: _t('Terra Cotta'),
        desc: _t('Rooted & handcrafted'),
        fontHead: 'Bitter',
        fontBody: 'Lato',
        fontHeadWeight: '700',
        radius: '0.375rem'
    },
    {
        id: 'earthy-06',
        category: 'earthy',
        name: _t('Linen & Clay'),
        desc: _t('Quiet & editorial'),
        fontHead: 'Cormorant Garamond',
        fontBody: 'Work Sans',
        fontHeadWeight: '600',
        radius: '0.625rem'
    },
    {
        id: 'earthy-07',
        category: 'earthy',
        name: _t('Garden Fresh'),
        desc: _t('Optimistic & natural'),
        fontHead: 'Nunito',
        fontBody: 'Lato',
        fontHeadWeight: '800',
        radius: '1.5rem'
    },
    {
        id: 'earthy-10',
        category: 'earthy',
        name: _t('Deep Sea'),
        desc: _t('Deep & trustworthy'),
        fontHead: 'Raleway',
        fontBody: 'Barlow',
        fontHeadWeight: '700',
        radius: '0.25rem'
    },
    // Dark / Inverted
    {
        id: 'inverted-01',
        category: 'inverted',
        name: _t('Ember'),
        desc: _t('Dramatic & expressive'),
        fontHead: 'Fraunces',
        fontBody: 'DM Sans',
        fontHeadWeight: '700',
        radius: '0.625rem'
    },
    {
        id: 'inverted-03',
        category: 'inverted',
        name: _t('Neon Chalk'),
        desc: _t('Raw & electric'),
        fontHead: 'Bebas Neue',
        fontBody: 'Barlow',
        fontHeadWeight: '400',
        radius: '0'
    },
    {
        id: 'inverted-05',
        category: 'inverted',
        name: _t('Cyber'),
        desc: _t('Digital & immersive'),
        fontHead: 'Space Grotesk',
        fontBody: 'DM Mono',
        fontHeadWeight: '700',
        radius: '0'
    },
    {
        id: 'inverted-06',
        category: 'inverted',
        name: _t('Night Sky'),
        desc: _t('Cinematic & intimate'),
        fontHead: 'Playfair Display',
        fontBody: 'Lato',
        fontHeadWeight: '700',
        radius: '0.75rem'
    },
];

// ── User-generated styles (logo "Detect from Logo" flow) ──────────────────────
// Four font + roundness combinations the user can pair with the colour palette
// extracted from their uploaded logo to generate a custom style.  Fonts and
// radius are copied from the matching premade styles (Steel Blue, Tropical
// Punch, Terra Cotta, Cyber).  These carry no real palette: `colors` is filled
// at runtime from the logo extraction.  They share the `user_category`
// category, which is intentionally NOT listed in STYLE_CATEGORIES so no
// category heading is shown for them in the UI.
export const USER_STYLE_COMBOS = [
    {
        id: 'user-1',
        category: 'user_category',
        name: _t('Confident'),
        desc: _t('Assured & trustworthy'),
        fontHead: 'Manrope',
        fontBody: 'Barlow',
        fontHeadWeight: '700',
        radius: '0.25rem'
    },
    {
        id: 'user-2',
        category: 'user_category',
        name: _t('Energetic'),
        desc: _t('Vivid & high-energy'),
        fontHead: 'Space Grotesk',
        fontBody: 'Plus Jakarta Sans',
        fontHeadWeight: '700',
        radius: '1.25rem'
    },
    {
        id: 'user-3',
        category: 'user_category',
        name: _t('Understated'),
        desc: _t('Quiet & understated'),
        fontHead: 'Bitter',
        fontBody: 'Lato',
        fontHeadWeight: '700',
        radius: '0.375rem'
    },
    {
        id: 'user-4',
        category: 'user_category',
        name: _t('Digital'),
        desc: _t('Sleek & futuristic'),
        fontHead: 'Space Grotesk',
        fontBody: 'DM Mono',
        fontHeadWeight: '700',
        radius: '0'
    },
];
