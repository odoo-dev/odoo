import { Plugin } from "@html_editor/plugin";
import { isEmpty } from "@html_editor/utils/dom_info";
import { removeClass } from "@html_editor/utils/dom";

function isMutationRecordSavable(record) {
    if (record.type === "attributes" && record.attributeName === "placeholder") {
        return false;
    }
    return true;
}

export class HintPlugin extends Plugin {
    static name = "hint";
    static dependencies = ["history", "selection"];
    static resources = (p) => ({
        history_rendering_classes: ["o-we-hint"],
        is_mutation_record_savable: isMutationRecordSavable,
        onSelectionChange: p.updateTempHint.bind(p),
    });

    setup() {
        this.tempHint = null;
        this.hintElements = new Set();
        this.updateHints(this.editable);
    }

    destroy() {
        this.clearHints();
    }

    handleCommand(command, payload) {
        switch (command) {
            case "CONTENT_UPDATED": {
                this.updateHints(payload.root);
                break;
            }
            case "CLEAN_NODE":
                this.clearHints(payload.root);
                break;
            case "CLEAN":
                this.clearHints();
                break;
        }
    }

    updateHints(root) {
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

        if (selection.isCollapsed) {
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
        this.hintElements.add(el);
    }

    removeHint(el) {
        el.removeAttribute("placeholder");
        removeClass(el, "o-we-hint");
        if (this.tempHint === el) {
            this.tempHint = null;
        }
        this.hintElements.delete(el);
    }

    clearHints(root) {
        const hintElements = root
            ? [...this.hintElements].filter((el) => root.contains(el))
            : this.hintElements;

        for (const hint of hintElements) {
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
