import { signal, t, useScope } from "@odoo/owl";
import { loadBundle } from "@web/core/assets";

export const emojiCategoryType = t.object({
    displayName: t.string(),
    name: t.string(),
    sortId: t.number(),
    title: t.string(),
    hexcode: t.string(),
    p_x: t.number(),
    p_y: t.number(),
});
/** @typedef {import("@odoo/owl").StripType<typeof emojiCategoryType>} EmojiCategory */

export const emojiType = t.object({
    category: emojiCategoryType,
    codepoints: t.string(),
    emoticons: t.array(t.string()),
    keywords: t.array(t.string()),
    name: t.string(),
    shortcodes: t.array(t.string()),
    hexcode: t.string(),
    p_x: t.number(),
    p_y: t.number(),
});
/** @typedef {import("@odoo/owl").StripType<typeof emojiType>} Emoji */

/**
 * @returns {{ categories: EmojiCategory[], emojis: Emoji[] }}
 */
function processEmojiData(twemoji = false) {
    const { getCategories, getEmojis } = odoo.loader.modules.get(
        twemoji ? "@web/core/emoji_picker/extra_emoji_data" : "@web/core/emoji_picker/emoji_data"
    );

    // Get and freeze categories & emojis (only list objects are frozen at this
    // point: internal objects are still writable).
    /** @type {EmojiCategory[]} */
    const categories = Object.freeze(getCategories());
    /** @type {(Emoji & { category: string })[]} */
    const emojis = Object.freeze(getEmojis());
    /** @type {Record<string, EmojiCategory>} */
    const categoryMap = {};
    for (const category of categories) {
        categoryMap[category.name] = category;

        // Freeze category object
        Object.freeze(category);
    }

    for (const emoji of emojis) {
        emoji.category = categoryMap[emoji.category];

        // Deep freeze emoji data
        Object.freeze(emoji);
        Object.freeze(emoji.emoticons);
        Object.freeze(emoji.keywords);
        Object.freeze(emoji.shortcodes);
    }

    return { categories, emojis };
}

class EmojiLoader {
    get categories() {
        return this._categories();
    }
    get emojis() {
        return this._emojis();
    }
    get twemojis() {
        return this._twemojis();
    }
    get loaded() {
        return this._emojis().length > 0;
    }
    get twemojiLoaded() {
        return this._twemojis().length > 0;
    }

    _insertEmoji(map, emoji) {
        map.set(emoji.codepoints, emoji);
        for (const emoticon of emoji.emoticons) {
            map.set(emoticon, emoji);
        }
        for (const shortcode of emoji.shortcodes) {
            map.set(shortcode, emoji);
        }
    }
    /**
     * Mapping to emojis from:
     * - codepoints
     * - emoticons
     * - shortcodes
     */
    get map() {
        if (!this.loaded) {
            // Not loaded: do not compute yet
            return DEFAULT_EMOJI_MAP;
        }
        if (!this._map) {
            this._map = new Map();
            for (const emoji of this._emojis()) {
                this._insertEmoji(this._map, emoji);
            }
        }
        return this._map;
    }

    get twemojiMap() {
        if (!this.twemojiLoaded) {
            return DEFAULT_EMOJI_MAP;
        }
        if (!this._twemojiMap) {
            this._twemojiMap = new Map();
            for (const emoji of this._twemojis()) {
                this._insertEmoji(this._twemojiMap, emoji);
            }
        }
        return this._twemojiMap;
    }

    /**
     * @private
     * @type {import("@odoo/owl").Signal<EmojiCategory[]>}
     */
    _categories = signal.Array([]);
    /**
     * @private
     * @type {import("@odoo/owl").Signal<Emoji[]>}
     */
    _emojis = signal.Array([]);
    /**
     * @private
     * @type {import("@odoo/owl").Signal<Emoji[]>}
     */
    _twemojis = signal.Array([]);
    /**
     * @private
     * @type {import("@odoo/owl").Signal<Emoji[]>}
     *
     * Stores only the extra twemoji entries coming from the twemoji bundle.
     * Keeping these separate ensures we can merge them with the base emojis
     * whichever bundle resolves first.
     */
    _twemojiExtras = signal.Array([]);
    /**
     * @private
     * @type {Promise<EmojiLoader>}
     */
    _loadingPromise = null;
    /**
     * @private
     * @type {Promise<EmojiLoader> & { abort: () => void } | null}
     */
    _loadingTwemojiPromise = null;
    /**
     * @private
     * @type {Map<string, Emoji> | null}
     */
    _map = null;
    /**
     * @private
     * @type {Map<string, Emoji> | null}
     */
    _twemojiMap = null;

    /**
     * Returns the first short code associated to a given emoji value.
     *
     * @param {string} value
     */
    getShortCode(value) {
        return (
            this.twemojiMap.get(value)?.shortcodes?.[0] ??
            this.map.get(value)?.shortcodes?.[0] ??
            "?"
        );
    }

    getHexCode(value) {
        const hexcode = this.twemojiMap.get(value)?.hexcode;
        if (hexcode) {
            return hexcode;
        }

        if (value === "👁️‍🗨️") {
            return "1f441-200d-1f5e8";
        }
        if (!value.includes("\u200d")) {
            value = value.replace(/\ufe0f/g, "");
        }
        return [...value].map((char) => char.codePointAt(0).toString(16)).join("-");
    }

    _createBundlePromise(bundlePromise, abortSignal, twemoji, cacheKey) {
        const promise = bundlePromise
            .then(() => {
                if (abortSignal?.aborted) {
                    return Promise.reject("loading aborted");
                }
                const { categories, emojis } = processEmojiData(twemoji);
                if (twemoji) {
                    this._twemojiExtras.set(emojis);
                    this._twemojis.set([...this._emojis(), ...this._twemojiExtras()]);
                } else {
                    this._categories.set(categories);
                    this._emojis.set(emojis);
                    if (this._loadingTwemojiPromise !== null) {
                        this._twemojis.set([...this._emojis(), ...this._twemojiExtras()]);
                    }
                }
                return this;
            })
            .catch(() => {
                // Failure: could be intentional (tour ended successfully while emoji still loading)
                // -> returns forever promise
                this[cacheKey] = null;
                return new Promise(() => {});
            });
        return promise;
    }

    /**
     * Entry point to load emoji data (stored in
     * **`@web/core/emoji_picker/emoji_data.js`**).
     *
     * This function is memoized on the 'emojiLoader' singleton, so it will always
     * return the same promise.
     *
     * If the promise fails (e.g. by being aborted, or because it was run in a tour
     * that has ended), it is left pending forever, and the promise kept by the
     * loader is reset to allow retrying to fetch emoji data.
     * @param {boolean} [twemoji] Whether to load the twemoji bundle.
     * @param {AbortSignal} [abortSignal]
     */
    load(twemoji, abortSignal) {
        if (!this._loadingPromise) {
            this._loadingPromise = this._createBundlePromise(
                this.loadEmojiBundle(),
                abortSignal,
                false,
                "_loadingPromise"
            );
        }
        if (!twemoji) {
            return this._loadingPromise;
        }

        if (!this._loadingTwemojiPromise) {
            this._loadingTwemojiPromise = this._createBundlePromise(
                this.loadTwemojiBundle(),
                abortSignal,
                true,
                "_loadingTwemojiPromise"
            );
        }

        const promise = Promise.all([this._loadingTwemojiPromise, this._loadingPromise]).then(
            () => this
        );
        return promise;
    }

    loadTwemojiBundle() {
        return Promise.all([
            fetch("/web/static/img/twemoji_sprite.png"),
            loadBundle("web.assets_extra_emoji"),
        ]);
    }

    /**
     * Can be overridden on the `emojiLoader` instance to load a different bundle.
     */
    loadEmojiBundle() {
        return loadBundle("web.assets_emoji");
    }
}

/** @type {Map<string, Emoji>} */
const DEFAULT_EMOJI_MAP = new Map();

export function useLoadEmoji(twemoji = false) {
    const { abortSignal } = useScope();
    return function loadEmoji() {
        return emojiLoader.load(twemoji, abortSignal);
    }.bind(twemoji);
}

export const emojiLoader = new EmojiLoader();
