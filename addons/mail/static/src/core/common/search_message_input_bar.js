import { Component, useExternalListener, useState } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { useAutofocus } from "@web/core/utils/hooks";
import { useMessageSearch } from "./message_search_hook";

/**
 * @typedef {Object} Props
 * @property {import("@mail/core/common/thread_model").Thread} thread
 * @property {function} [closeSearch]
 */

export class SearchMessageInputBar extends Component {
    static template = "mail.SearchMessageInputBar";
    static props = ["thread", "closeSearch?", "store"];

    setup() {
        super.setup();
        this.state = useState({ searchTerm: "", searchedTerm: "" });
        this.messageSearch = useMessageSearch(this.props.thread);
        this.props.store.messageSearch = useState(this.messageSearch);
        useAutofocus();
        useExternalListener(
            browser,
            "keydown",
            (ev) => {
                if (ev.key === "Escape") {
                    this.props.closeSearch?.();
                }
            },
            { capture: true }
        );
    }

    search() {
        this.messageSearch.searchTerm = this.state.searchTerm;
        this.messageSearch.search();
        this.state.searchedTerm = this.state.searchTerm;
    }

    clear() {
        this.state.searchTerm = "";
        this.state.searchedTerm = this.state.searchTerm;
        this.messageSearch.clear();
        this.props.closeSearch?.();
    }

    onKeydownSearch(ev) {
        if (ev.key !== "Enter") {
            return;
        }
        if (!this.state.searchTerm) {
            this.clear();
        } else {
            this.search();
        }
    }
}
