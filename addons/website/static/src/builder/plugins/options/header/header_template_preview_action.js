import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";

/**
 * Maps each activation-signal xmlid to the identifying CSS class stamped
 * on the outermost element of the corresponding standalone content template
 * by the dispatcher in editor mode (see website_templates.xml).
 */
const TEMPLATE_CLASS_MAP = {
    "website.template_header_default":     "header_template_default",
    "website.template_header_hamburger":   "header_template_hamburger",
    "website.template_header_stretch":     "header_template_stretch",
    "website.template_header_vertical":    "header_template_vertical",
    "website.template_header_search":      "header_template_search",
    "website.template_header_sales_one":   "header_template_sales_one",
    "website.template_header_sales_two":   "header_template_sales_two",
    "website.template_header_sales_three": "header_template_sales_three",
    "website.template_header_sales_four":  "header_template_sales_four",
    "website.template_header_boxed":       "header_template_boxed",
    "website.template_header_sidebar":     "header_template_sidebar",
};

const WRAPWRAP_PREVIEW_CLASS = "o_isPreviewingHeaderTemplate";
const WRAPWRAP_PREVIEW_TEMPLATE_PREFIX = "o_isPreviewing";

const PREVIEW_HIDDEN_CLASS = "o_header_template_hidden";
const PREVIEW_ACTIVE_CLASS = "o_header_template_preview_active";

/**
 * Selector for the template-row dropdown items in the builder panel.
 * BuilderSelectItem renders data-action-id and data-action-param on the
 * root div of each item (see html_builder.BuilderSelectItem template).
 */
const ITEM_SELECTOR = ".o-hb-select-dropdown-item[data-action-id='reloadComposite']";

/**
 * Extract the header template xmlid from the data-action-param attribute
 * already rendered by BuilderSelectItem on each dropdown item.
 *
 * data-action-param is a JSON-serialised array of action definitions (the
 * reloadComposite actionParam). We find the websiteConfig entry and return
 * the first view in its views array that is a known header template xmlid.
 *
 * @param {Element} itemEl
 * @returns {string|null}
 */
function xmlidFromItem(itemEl) {
    const raw = itemEl.dataset.actionParam;
    if (!raw) {
        return null;
    }
    let defs;
    try {
        defs = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!Array.isArray(defs)) {
        return null;
    }
    const configEntry = defs.find((d) => d.action === "websiteConfig");
    const views = configEntry?.actionParam?.views;
    if (!Array.isArray(views)) {
        return null;
    }
    // Return the first view xmlid that maps to a known header template.
    return views.find((v) => v in TEMPLATE_CLASS_MAP) ?? null;
}

export class HeaderTemplatePreviewPlugin extends Plugin {
    static id = "HeaderTemplatePreviewPlugin";

    /**
     * @type {{ previewEl: Element, activeEl: Element, cls: * } | null}
     * Snapshot of the two elements whose classes were toggled so that
     * _revert() can restore them explicitly without re-querying the DOM.
     */
    _snapshot = null;

    setup() {
        this.headerEl = this.editable.querySelector('#top');

        this._onPointerEnter = this._onPointerEnter.bind(this);
        this._onPointerLeave = this._onPointerLeave.bind(this);

        // Use capture so we receive the event before any OWL handler
        // on the item itself, and use the top-level document since the
        // builder panel is outside the editable iframe.
        document.addEventListener("pointerenter", this._onPointerEnter, true);
        document.addEventListener("pointerleave", this._onPointerLeave, true);
    }

    destroy() {
        document.removeEventListener("pointerenter", this._onPointerEnter, true);
        document.removeEventListener("pointerleave", this._onPointerLeave, true);
        // Ensure the header is left in a clean state if the editor is
        // closed while a preview is active.
        this._revert();
    }

    _onPointerEnter(ev) {
        const itemEl = ev.target.closest(ITEM_SELECTOR);
        if (!itemEl) {
            return;
        }
        const xmlid = xmlidFromItem(itemEl);
        if (!xmlid) {
            return;
        }
        this._preview(xmlid);
    }

    _onPointerLeave(ev) {
        const itemEl = ev.target.closest(ITEM_SELECTOR);
        if (!itemEl) {
            return;
        }
        this._revert();
    }

    _preview(xmlid) {
        // Revert any prior preview before starting a new one so that
        // rapidly moving between items never stacks hidden-class changes.
        this._revert();

        const cls = TEMPLATE_CLASS_MAP[xmlid];
        if (!cls) {
            return;
        }

        const previewEls = this.headerEl.querySelectorAll(`.o_${cls}`);
        const activeEls = this.headerEl.querySelectorAll(".o_header_template_active");

        if (!previewEls || !activeEls || previewEls[0] === activeEls[0]) {
            return;
        }

        this._snapshot = { previewEls, activeEls, cls };

        this.editable.classList.add(WRAPWRAP_PREVIEW_CLASS);
        this.editable.classList.add(WRAPWRAP_PREVIEW_TEMPLATE_PREFIX.concat("_", cls));

        previewEls.forEach((navEl) => {
            navEl.classList.remove(PREVIEW_HIDDEN_CLASS);
            navEl.classList.add(PREVIEW_ACTIVE_CLASS);
        })
        activeEls.forEach((navEl) => {
            navEl.classList.add(PREVIEW_HIDDEN_CLASS);
        })
    }


    _revert() {
        if (!this._snapshot) {
            return;
        }
        const { previewEls, activeEls, cls } = this._snapshot;
        this._snapshot = null;

        this.editable.classList.remove(WRAPWRAP_PREVIEW_CLASS);
        this.editable.classList.remove(WRAPWRAP_PREVIEW_TEMPLATE_PREFIX.concat("_", cls));

        previewEls.forEach((navEl) => {
            navEl.classList.add(PREVIEW_HIDDEN_CLASS);
            navEl.classList.remove(PREVIEW_ACTIVE_CLASS);
        })
        activeEls.forEach((navEl) => {
            navEl.classList.remove(PREVIEW_HIDDEN_CLASS);
        })
    }
}

registry
    .category("website-plugins")
    .add(HeaderTemplatePreviewPlugin.id, HeaderTemplatePreviewPlugin);
