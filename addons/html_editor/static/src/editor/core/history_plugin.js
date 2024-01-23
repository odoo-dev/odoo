/** @odoo-module */

import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";

export class HistoryPlugin extends Plugin {
    static name = "history";
    static shared = ["enableObserver", "disableObserver"];

    setup() {
        this.observer = new MutationObserver(() => this.handleDOMChange());
        this.enableObserver();
        this._cleanups.push(() => this.observer.disconnect());
    }

    enableObserver() {
        this.observer.observe(this.editable, {
            attributes: true,
            childList: true,
            subtree: true,
            characterData: true,
        });
    }
    disableObserver() {
        const records = this.observer.takeRecords();
        if (records.length) {
            this.handleDOMChange();
        }
        this.observer.disconnect();
    }

    handleDOMChange() {
        // not sure about this, but cool to see in logs if a change has been observed
        this.dispatch("CONTENT_UPDATED", this.el);
    }
}

registry.category("phoenix_plugins").add(HistoryPlugin.name, HistoryPlugin);
