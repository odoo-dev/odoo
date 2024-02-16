import { Plugin } from "../plugin";
import { isEmpty } from "../utils/dom_info";
import { removeClass } from "../utils/dom";
import { registry } from "@web/core/registry";

function filterMutationRecords(records) {
    return records.filter((record) => {
        if (record.type === "attributes" && record.attributeName === "placeholder") {
            return false;
        }
        return true;
    });
}

export class HintPlugin extends Plugin {
    static name = "hint";
    static dependencies = ["history", "selection"];
    static resources = (p) => ({
        history_rendering_classes: ["o-we-hint"],
        filter_mutation_record: filterMutationRecords,
        onSelectionChange: p.updateTempHint.bind(p),
    });

    setup() {
        this.tempHint = null;
        this.updateHints();
    }

    destroy() {
        this.clearHints();
    }

    handleCommand(command, payload) {
        switch (command) {
            case "CONTENT_UPDATED": {
                const root = payload || this.editable;
                this.updateHints(root);
                break;
            }
            case "CLEAN_BEFORE_SPLIT_BLOCK": // @todo @phoenix: maybe use the NORMALIZE command for this?
                this.clearHints();
                break;
            case "CLEAN":
                this.clearHints();
                break;
        }
    }

    updateHints(root = this.editable) {
        this.clearHints(root);

        // Add empty block hints.
        for (const { selector, hint } of this.resources.emptyBlockHints) {
            for (const el of this.selectElements(root, selector)) {
                if (isEmpty(el)) {
                    this.makeHint(el, hint);
                }
            }
        }

        this.updateTempHint(this.shared.getEditableSelection());
    }

    updateTempHint(selection) {
        if (this.tempHint) {
            this.removeHint(this.tempHint);
        }

        if (selection.isCollapsed && this.editable.contains(selection.commonAncestorContainer)) {
            for (const hint of this.resources["temp_hints"]) {
                const target = hint.target(selection);
                // Do not replace an existing empty block hint by a temp hint.
                if (target && !target.classList.contains("o-we-hint")) {
                    this.makeHint(target, hint.text);
                    this.tempHint = target;
                    return;
                }
            }
        }
    }

    makeHint(el, text) {
        el.setAttribute("placeholder", text);
        el.classList.add("o-we-hint");
    }

    removeHint(el) {
        el.removeAttribute("placeholder");
        removeClass(el, "o-we-hint");
        if (this.tempHint === el) {
            this.tempHint = null;
        }
    }

    clearHints(root = this.editable) {
        for (const hint of this.selectElements(root, ".o-we-hint")) {
            this.removeHint(hint);
        }
    }

    /**
     * Basically a wrapper around `root.querySelectorAll` that includes the
     * root, unless it is the editable.
     *
     * @param {Element} root - The root element to search within.
     * @param {string} selector - The CSS selector to match elements against.
     * @returns {Element[]} - An array of elements that match the selector.
     */
    selectElements(root, selector) {
        const matchedElements = [...root.querySelectorAll(selector)];
        if (root !== this.editable && root.matches(selector)) {
            matchedElements.unshift(root);
        }
        return matchedElements;
    }
}

registry.category("phoenix_plugins").add(HintPlugin.name, HintPlugin);
