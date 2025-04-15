import { Component, useState, onWillUpdateProps } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { useCachedModel } from "@html_builder/core/cached_model_utils";
import { _t } from "@web/core/l10n/translation";
import { useDropdownState } from "@web/core/dropdown/dropdown_hooks";
import { AutoComplete } from "@web/core/autocomplete/autocomplete";

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
    static components = { Dropdown, AutoComplete };

    setup() {
        this.orm = useService("orm");
        this.cachedModel = useCachedModel();
        this.state = useState({
            limit: this.props.limit,
            sources: [{ options: this.options.bind(this, this.props.limit) }],
        });
        this.dropdown = useDropdownState();
        onWillUpdateProps(async (newProps) => {
            if (this.searchInvalidationKey(this.props) !== this.searchInvalidationKey(newProps)) {
                this.state.sources = [{ options: this.options.bind(this, this.props.limit) }];
            }
        });
    }
    searchInvalidationKey(props) {
        return JSON.stringify([props.model, props.fields, props.domain]);
    }

    close() {
        this.dropdown.close();
    }

    /**
     * @param {String} searchValue
     * @return {Promise<{searchResults: Array<{display_name: String, name: String, id: String, [fields]}>, hasMore: Boolean}>}
     */
    async search(limit, searchValue) {
        const tuples = await this.orm.call(this.props.model, "name_search", [], {
            name: searchValue,
            domain: Object.values(this.props.domain).filter((item) => item !== null),
            operator: "ilike",
            limit: this.state.limit + 1,
        });
        const hasMore = tuples.length > this.state.limit;
        const searchResults = await this.cachedModel.ormRead(
            this.props.model,
            tuples.slice(0, this.state.limit).map(([id, _name]) => id),
            [...new Set(this.props.fields).add("display_name").add("name")]
        );
        const selectedIds = new Set(this.props.selected.map((e) => e.id));
        return {
            searchResults: searchResults.filter((entry) => !selectedIds.has(entry.id)),
            hasMore,
        };
    }
    /**
     * @param {String} name
     * @returns {Promise<Boolean>}
     */
    async allowCreate(name) {
        if (name.length === 0 || !this.props.create) {
            return false;
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
        return !usedNames.includes(name);
    }
    onOptionSelected({ value: { more, entry, create } }) {
        if (more) {
            this.state.limit += this.props.limit;
            this.state.sources = [{ options: this.options.bind(this, this.state.limit) }];
        }
        if (entry) {
            this.props.select(entry);
            this.dropdown.close();
        }
        if (create) {
            this.props.create(create);
            this.dropdown.close();
        }
    }
    async options(limit, request) {
        const { hasMore, searchResults } = await this.search(limit, request);
        const res = [
            ...searchResults.map((entry) => ({ label: entry.display_name, value: { entry } })),
        ];
        if (hasMore) {
            res.push({
                label: _t("Search more..."),
                classList: "o_we_m2o_search_more",
                value: { more: true },
                notAValue: true,
            });
        }
        if (await this.allowCreate(request)) {
            res.push({
                label: _t("Create"),
                classList: "o_we_m2o_create",
                value: { create: request },
            });
        }
        return res;
    }
}
