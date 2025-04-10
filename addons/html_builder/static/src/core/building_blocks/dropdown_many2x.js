import { Component, useRef, useState, onWillUpdateProps } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { debounce } from "@web/core/utils/timing";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { useCachedModel } from "@html_builder/core/cached_model_utils";
import { _t } from "@web/core/l10n/translation";
import { useDropdownState } from "@web/core/dropdown/dropdown_hooks";
import { ACTIVE_ELEMENT_CLASS } from "@web/core/navigation/navigation";

export class DropdownMany2X extends Component {
    static template = "html_builder.DropdownMany2X";
    static props = {
        model: String,
        fields: { type: Array, element: String, optional: true },
        domain: { type: Array, optional: true },
        limit: { type: Number, optional: true },
        selected: { type: Array, element: { type: Object, shape: { id: Number, "*": true } } },
        select: Function,
        closeOnEnterKey: { type: Boolean, optional: true },
        message: { type: String, optional: true },
        create: { type: Function, optional: true },
    };
    static defaultProps = {
        fields: [],
        domain: [],
        limit: 5,
        closeOnEnterKey: true,
        message: _t("Choose a record..."),
    };
    static components = { Dropdown, DropdownItem };

    setup() {
        this.orm = useService("orm");
        this.cachedModel = useCachedModel();
        this.searchRef = useRef("search");
        this.createInputRef = useRef("createInput");
        this.state = useState({
            createEnabled: false,
            searchResults: [],
            limit: this.props.limit,
        });
        this.dropdown = useDropdownState();
        const debouncedSearch = debounce(this.search.bind(this), 300);
        this.lastSearch = Promise.resolve();
        this.onSearch = async (...args) => {
            this.lastSearch = debouncedSearch(...args);
        };
        this.state.searchResults = [];
        onWillUpdateProps(async (newProps) => {
            if (this.searchInvalidationKey(this.props) !== this.searchInvalidationKey(newProps)) {
                this.state.searchResults = [];
            }
        });
    }
    searchInvalidationKey(props) {
        return JSON.stringify([props.model, props.fields, props.domain]);
    }
    async search(ev) {
        if (this.dropdown.isOpen) {
            await this._search(ev.target.value);
        }
    }
    searchMore() {
        this.state.limit += this.props.limit;
        this.searchRef.el?.focus();
    }
    async _search(searchValue) {
        const tuples = await this.orm.call(this.props.model, "name_search", [], {
            name: searchValue,
            domain: Object.values(this.props.domain).filter((item) => item !== null),
            operator: "ilike",
            limit: this.state.limit + 1,
        });
        this.state.hasMore = tuples.length > this.state.limit;
        this.state.searchResults = await this.cachedModel.ormRead(
            this.props.model,
            tuples.slice(0, this.state.limit).map(([id, _name]) => id),
            [...new Set(this.props.fields).add("display_name").add("name")]
        );
    }
    filteredSearchResult() {
        const selectedIds = new Set(this.props.selected.map((e) => e.id));
        return this.state.searchResults.filter((entry) => !selectedIds.has(entry.id));
    }
    async onKeyDown(ev) {
        if (ev.key === "Enter" && this.searchRef.el?.classList.contains(ACTIVE_ELEMENT_CLASS)) {
            await this.lastSearch;
            const searchResult = this.filteredSearchResult();
            if (searchResult.length) {
                this.props.select(searchResult[0]);
                if (this.props.closeOnEnterKey) {
                    this.dropdown.close();
                    ev.preventDefault();
                }
            }
        }
    }
    onNavigationEnabled(navigator) {
        navigator.items[0]?.setActive();
    }
    async onCreateInput() {
        const name = this.createInputRef.el.value;
        if (!name.length) {
            this.state.createEnabled = false;
            return;
        }
        const allRecords = await this.cachedModel.ormSearchRead(
            this.props.model,
            [],
            ["id", "name"]
        );
        const usedNames = [
            // Exclude existing names
            ...allRecords.map((item) => item.name),
            // Exclude new names
            ...this.props.selected.map((item) => item.name),
        ];
        this.state.createEnabled = !usedNames.includes(name);
    }
    create() {
        const name = this.createInputRef.el.value;
        this.props.create(name);
        this.dropdown.close();
    }
}
