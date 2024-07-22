import { Component, useState } from "@odoo/owl";

import { useService } from "@web/core/utils/hooks";

export class ResourceList extends Component {
    static props = { resources: Array };
    static template = "t9n.ResourceList";

    setup() {
        this.action = useService("action");
        this.state = useState({
            filters: {
                searchText: "",
            },
            sorting: {
                column: "file_name",
                order: "asc",
            },
        });
        this.store = useState(useService("mail.store"));
        this.fetchResources();
    }

    get resources() {
        const searchTerms = this.state.filters.searchText.trim().toUpperCase();
        const resources = searchTerms
            ? this.props.resources.filter((r) => r.file_name.toUpperCase().includes(searchTerms))
            : [...this.props.resources];

        resources.sort((r1, r2) => {
            let r1Col = r1[this.state.sorting.column];
            let r2Col = r2[this.state.sorting.column];

            r1Col = r1Col.toLowerCase();
            r2Col = r2Col.toLowerCase();

            if (r1Col < r2Col) {
                return this.state.sorting.order === "asc" ? -1 : 1;
            }
            if (r1Col > r2Col) {
                return this.state.sorting.order === "asc" ? 1 : -1;
            }
            return 0;
        });
        return resources;
    }

    async fetchResources() {
        const resourceData = await this.env.services.orm.call(
            "t9n.resource",
            "get_resources",
            [this.props.resources.map(({ id }) => id)],
        );
        this.store["t9n.resource"].insert(resourceData);
    }

    onClickColumnName(column) {
        if (this.state.sorting.column === column) {
            this.state.sorting.order = this.state.sorting.order === "asc" ? "desc" : "asc";
        } else {
            this.state.sorting.column = column;
            this.state.sorting.order = "asc";
        }
    }

    onClickResource(resource) {
        this.store.t9n.activeView = "TranslationEditor";
        this.store.t9n.activeResource = resource;
    }
}
