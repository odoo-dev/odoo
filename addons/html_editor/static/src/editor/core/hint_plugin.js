/** @odoo-module */

import { _t } from "@web/core/l10n/translation";
import { Plugin } from "../plugin";
import { isEmpty } from "../utils/dom_info";
import { removeClass } from "../utils/dom";

export class HintPlugin extends Plugin {
    static name = "hint";
    static dependencies = ["history"];

    setup() {
        this.tempHints = new Set();
        this.hints = {
            BLOCKQUOTE: _t("Empty quote"),
            H1: _t("Heading 1"),
            H2: _t("Heading 2"),
            H3: _t("Heading 3"),
            H4: _t("Heading 4"),
            H5: _t("Heading 5"),
            H6: _t("Heading 6"),
            "UL LI": _t("List"),
            "OL LI": _t("List"),
            "CL LI": _t("To-do"),
        };
        this.addDomListener(this.document, "selectionchange", this.handleSelectionChange);
        this.updateHints();
    }

    handleCommand(command, payload) {
        switch (command) {
            case "CONTENT_UPDATED":
                this.updateHints();
                break;
            case "CREATE_HINT":
                this.createTempHint(payload.el, payload.text);
                break;
            case "CLEAN": {
                const root = payload;
                for (const hint of root.querySelectorAll(".o-we-hint")) {
                    this.removeHint(hint);
                }
                this.tempHints.clear();
            }
        }
    }

    createTempHint(el, text) {
        if (el.classList.contains("o-we-hint")) {
            // a temp hint does not have precedence over an actual hint
            return;
        }
        this.tempHints.add(el);
        this.makeHint(el, text);
    }

    updateHints() {
        // remove all outdated (=non empty) hints
        for (const hint of this.editable.querySelectorAll(".o-we-hint")) {
            if (!isEmpty(hint)) {
                this.removeHint(hint);
                if (this.tempHints.has(hint)) {
                    this.tempHints.delete(hint);
                }
            }
        }
        // add new hints, if any
        for (const [selector, text] of Object.entries(this.hints)) {
            for (const el of this.editable.querySelectorAll(selector)) {
                if (!el.classList.contains("o-we-hint") && isEmpty(el)) {
                    this.makeHint(el, text);
                }
            }
        }
    }

    handleSelectionChange() {
        for (const el of this.tempHints) {
            this.removeHint(el);
        }
        this.tempHints.clear();
    }

    makeHint(el, text) {
        this.shared.disableObserver();
        el.setAttribute("placeholder", text);
        el.classList.add("o-we-hint");
        this.shared.enableObserver();
    }

    removeHint(el) {
        this.shared.disableObserver();
        el.removeAttribute("placeholder");
        removeClass(el, "o-we-hint");
        this.shared.enableObserver();
    }
}
