
export class PairSet {
    constructor() {
        this.map = new Map(); // map of [1] => Set<[2]>
    }
    add(elem1, elem2) {
        if (!this.map.has(elem1)) {
            this.map.set(elem1, new Set());
        }
        this.map.get(elem1).add(elem2);
    }
    has(elem1, elem2) {
        if (!this.map.has(elem1)) {
            return false;
        }
        return this.map.get(elem1).has(elem2);
    }
    delete(elem1, elem2) {
        if (!this.map.has(elem1)) {
            return;
        }
        const s = this.map.get(elem1);
        s.delete(elem2)
        if (!s.size) {
            this.map.delete(elem1);
        }
    }
}

/**
 * Updates the element's iframe according to whether the cookies should be
 * approved (marked by `_post_processing_att` server-side).
 *
 * @param {HTMLElement} rootEl - root element of the widget.
 * @param {string} src - src to set on the iframe.
 */
export const manageIframeSrc = function (rootEl, src) {
    const iframeEl = rootEl.querySelector("iframe");
    if (!rootEl.dataset.needCookiesApproval) {
        iframeEl.setAttribute("src", src);
    } else {
        iframeEl.dataset.nocookieSrc = src;
        iframeEl.setAttribute("src", "about:blank");
        iframeEl.dispatchEvent(new Event("add_cookies_warning"));
    }
}
