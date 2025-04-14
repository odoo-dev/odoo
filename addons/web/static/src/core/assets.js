import { Component, onWillStart, whenReady, xml } from "@odoo/owl";
import { session } from "@web/session";
import { registry } from "./registry";

/**
 * @typedef {{
 *  cssLibs: string[];
 *  jsLibs: string[];
 * }} BundleFileNames
 */

/** @type {WeakMap<Document, Map<string, Promise<BundleFileNames | void>>>} */
export const cacheMapByDocument = new WeakMap();

/** @returns {Map<string, Promise<BundleFileNames | void>>} */
function getCacheMap(targetDoc) {
    if (!cacheMapByDocument.has(targetDoc)) {
        cacheMapByDocument.set(targetDoc, new Map());
    }
    return cacheMapByDocument.get(targetDoc);
}

export function computeBundleCacheMap(targetDoc) {
    const cacheMap = getCacheMap(targetDoc);
    for (const script of targetDoc.head.querySelectorAll("script[src]")) {
        cacheMap.set(script.getAttribute("src"), Promise.resolve());
    }
    for (const link of targetDoc.head.querySelectorAll("link[rel=stylesheet][href]")) {
        cacheMap.set(link.getAttribute("href"), Promise.resolve());
    }
}

whenReady(() => computeBundleCacheMap(document));

/**
 * @param {HTMLLinkElement | HTMLScriptElement} el
 * @param {(event: Event) => any} onLoad
 * @param {(error: Error) => any} onError
 */
const onLoadAndError = (el, onLoad, onError) => {
    const onLoadListener = (event) => {
        removeListeners();
        onLoad(event);
    };

    const onErrorListener = (error) => {
        removeListeners();
        onError(error);
    };

    const removeListeners = () => {
        el.removeEventListener("load", onLoadListener);
        el.removeEventListener("error", onErrorListener);
    };

    el.addEventListener("load", onLoadListener);
    el.addEventListener("error", onErrorListener);

    window.addEventListener("pagehide", () => {
        removeListeners();
    });
};

/** @type {typeof assets["getBundle"]} */
export function getBundle() {
    return assets.getBundle(...arguments);
}

/** @type {typeof assets["loadBundle"]} */
export function loadBundle() {
    return assets.loadBundle(...arguments);
}

/** @type {typeof assets["loadJS"]} */
export function loadJS() {
    return assets.loadJS(...arguments);
}

/** @type {typeof assets["loadCSS"]} */
export function loadCSS() {
    return assets.loadCSS(...arguments);
}

export class AssetsLoadingError extends Error {}

/**
 * Utility component that loads an asset bundle before instanciating a component
 */
export class LazyComponent extends Component {
    static template = xml`<t t-component="Component" t-props="componentProps"/>`;
    static props = {
        Component: String,
        bundle: String,
        props: { type: [Object, Function], optional: true },
    };
    setup() {
        onWillStart(async () => {
            await loadBundle(this.props.bundle);
            this.Component = registry.category("lazy_components").get(this.props.Component);
        });
    }

    get componentProps() {
        return typeof this.props.props === "function" ? this.props.props() : this.props.props;
    }
}

/**
 * This export is done only in order to modify the behavior of the exported
 * functions. This is done in order to be able to make a test environment.
 * Modules should only use the methods exported below.
 */
export const assets = {
    retries: {
        count: 3,
        delay: 5000,
        extraDelay: 2500,
    },
    /**
     *
     * @param result
     * @return {{cssLibs: [], jsLibs: []}}
     * @private
     */
    _processBundle(result) {
        const cssLibs = [];
        const jsLibs = [];
        for (const { src, type } of Object.values(result)) {
            if (type === "link" && src) {
                cssLibs.push(src);
            } else if (type === "script" && src) {
                jsLibs.push(src);
            }
        }
        return { cssLibs, jsLibs };
    },
    /**
     *
     * @param {string} bundleName Name of the bundle containing the list of files
     * @param {Map<string, Promise<BundleFileNames | void>>} cacheMap
     * @return {Promise<{cssLibs: [], jsLibs: []} | *>}
     * @private
     */
    _getBundleRPC(bundleName, cacheMap) {
        const url = new URL(`/web/bundle/${bundleName}`, location.origin);
        for (const [key, value] of Object.entries(session.bundle_params || {})) {
            url.searchParams.set(key, value);
        }
        return fetch(url)
            .then(async (response) => {
                if (response.bodyUsed) {
                    return { cssLibs: [], jsLibs: [] };
                }
                return assets._processBundle(await response.json());
            })
            .catch((reason) => {
                cacheMap.delete(bundleName);
                throw new AssetsLoadingError(`The loading of ${url} failed`, { cause: reason });
            });
    },
    /**
     * Get the files information as descriptor object from a public asset template.
     *
     * @param {string} bundleName Name of the bundle containing the list of files
     * @param {Object} options
     * @param {Document} [options.targetDoc=document] document to which the bundle will be applied (e.g. iframe document)
     * @returns {Promise<BundleFileNames>}
     */
    getBundle(bundleName, { targetDoc = document } = {}) {
        const cacheMap = getCacheMap(targetDoc);
        if (cacheMap.has(bundleName)) {
            return cacheMap.get(bundleName);
        }
        const promise = assets._getBundleRPC(bundleName, cacheMap);
        cacheMap.set(bundleName, promise);
        return promise;
    },

    /**
     * Loads the given js/css libraries and asset bundles. Note that no library or
     * asset will be loaded if it was already done before.
     *
     * @param {string} bundleName
     * @param {Object} options
     * @param {Document} [options.targetDoc=document] document to which the bundle will be applied (e.g. iframe document)
     * @param {Boolean} [options.css=true] apply bundle css on targetDoc
     * @param {Boolean} [options.js=true] apply bundle js on targetDoc
     * @returns {Promise<void[]>}
     */
    loadBundle(bundleName, { targetDoc = document, css = true, js = true } = {}) {
        if (typeof bundleName !== "string") {
            throw new Error(
                `loadBundle(bundleName:string) accepts only bundleName argument as a string ! Not ${JSON.stringify(
                    bundleName
                )} as ${typeof bundleName}`
            );
        }
        return getBundle(bundleName, { targetDoc }).then(({ cssLibs, jsLibs }) => {
            const promises = [];
            if (css && cssLibs) {
                promises.push(...cssLibs.map((url) => assets.loadCSS(url, { targetDoc })));
            }
            if (js && jsLibs) {
                promises.push(...jsLibs.map((url) => assets.loadJS(url, { targetDoc })));
            }
            return Promise.all(promises);
        });
    },

    /**
     * Loads the given url as a stylesheet.
     *
     * @param {string} url the url of the stylesheet
     * @param {number} [retryCount]
     * @param {Object} options
     * @param {number} [retryCount]
     * @param {Document} [options.targetDoc=document] document to which the bundle will be applied (e.g. iframe document)
     * @returns {Promise<void>} resolved when the stylesheet has been loaded
     */
    loadCSS(url, { retryCount = 0, targetDoc = document } = {}) {
        const cacheMap = getCacheMap(targetDoc);
        if (cacheMap.has(url)) {
            return cacheMap.get(url);
        }
        const linkEl = targetDoc.createElement("link");
        linkEl.setAttribute("href", url);
        linkEl.type = "text/css";
        linkEl.rel = "stylesheet";
        const promise = new Promise((resolve, reject) =>
            onLoadAndError(linkEl, resolve, async (error) => {
                cacheMap.delete(url);
                if (retryCount < assets.retries.count) {
                    const delay = assets.retries.delay + assets.retries.extraDelay * retryCount;
                    await new Promise((res) => setTimeout(res, delay));
                    linkEl.remove();
                    loadCSS(url, { retryCount: retryCount + 1, targetDoc })
                        .then(resolve)
                        .catch((reason) => {
                            cacheMap.delete(url);
                            reject(reason);
                        });
                } else {
                    reject(
                        new AssetsLoadingError(`The loading of ${url} failed`, { cause: error })
                    );
                }
            })
        );
        cacheMap.set(url, promise);
        targetDoc.head.appendChild(linkEl);
        return promise;
    },

    /**
     * Loads the given url inside a script tag.
     *
     * @param {string} url the url of the script
     * @param {Document} targetDoc document to which the bundle will be applied (e.g. iframe document)
     * @returns {Promise<void>} resolved when the script has been loaded
     */
    loadJS(url, { targetDoc = document } = {}) {
        const cacheMap = getCacheMap(targetDoc);
        if (cacheMap.has(url)) {
            return cacheMap.get(url);
        }
        const scriptEl = targetDoc.createElement("script");
        scriptEl.setAttribute("src", url);
        scriptEl.type = url.includes("web/static/lib/pdfjs/") ? "module" : "text/javascript";
        const promise = new Promise((resolve, reject) =>
            onLoadAndError(scriptEl, resolve, (error) => {
                cacheMap.delete(url);
                reject(new AssetsLoadingError(`The loading of ${url} failed`, { cause: error }));
            })
        );
        cacheMap.set(url, promise);
        targetDoc.head.appendChild(scriptEl);
        return promise;
    },
};
