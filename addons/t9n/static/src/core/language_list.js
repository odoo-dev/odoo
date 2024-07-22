import { Component, useState } from "@odoo/owl";

import { useService } from "@web/core/utils/hooks";

export class LanguageList extends Component {
    static props = { languages: Array };
    static template = "t9n.LanguageList";

    setup() {
        this.action = useService("action");
        this.state = useState({
            filters: {
                searchText: "",
            },
            sorting: {
                column: "name",
                order: "asc",
            },
        });
        this.store = useState(useService("mail.store"));
    }

    get languages() {
        const searchTerms = this.state.filters.searchText.trim().toUpperCase();
        const languages = searchTerms
            ? this.props.languages.filter((l) => l.name.toUpperCase().includes(searchTerms))
            : [...this.props.languages];
        return languages.sort((l1, l2) => {
            const l1Col = l1[this.state.sorting.column];
            const l2Col = l2[this.state.sorting.column];

            if (l1Col < l2Col) {
                return this.state.sorting.order === "asc" ? -1 : 1;
            }
            if (l1Col > l2Col) {
                return this.state.sorting.order === "asc" ? 1 : -1;
            }
            return 0;
        });
    }

    onClickColumnName(column) {
        if (this.state.sorting.column === column) {
            this.state.sorting.order = this.state.sorting.order === "asc" ? "desc" : "asc";
        } else {
            this.state.sorting.column = column;
            this.state.sorting.order = "asc";
        }
    }

    onClickLanguage(language) {
        this.store.t9n.activeView = "ResourceList";
        this.store.t9n.activeLanguage = language;
    }
}
