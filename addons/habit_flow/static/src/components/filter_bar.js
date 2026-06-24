import { Component, props, t } from "@odoo/owl";

export class FilterBar extends Component {
    static template = "habit_flow.FilterBar";
    props = props({
        search: t.string(),
        activeFilter: t.string(),
        counts: t.object(),
        onSearch: t.function(),
        onFilter: t.function(),
    });

    filters = [
        { id: "all", label: "All" },
        { id: "done", label: "Done Today" },
        { id: "pending", label: "Pending" },
        { id: "archived", label: "Archived" },
    ];

    onSearchInput(ev) {
        this.props.onSearch(ev.target.value);
    }
}
