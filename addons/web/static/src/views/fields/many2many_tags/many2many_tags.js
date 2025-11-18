import { Component } from "@odoo/owl";
import { useTagNavigation } from "@web/core/record_selectors/tag_navigation_hook";
import { TagsList } from "@web/core/tags_list/tags_list";
import { Many2XAutocomplete } from "@web/views/fields/relational_utils";

export function computeM2XProps(fieldProps) {
    return {
    };
}

export class Many2ManyTags extends Component {
    static template = "web.Many2ManyTags";
    static components = { TagsList, Many2XAutocomplete };
    static props = {
        context: { type: Object, optional: true },
        domain: { type: Function, optional: true },
        id: { type: String, optional: true },
        nameCreateField: { type: String, optional: true },
        readonly: { type: Boolean, optional: true },
        relation: { type: String },
        searchThreshold: { type: Number, optional: true },
        specification: { type: Object, optional: true },
        slots: { type: Object },
        string: { type: String, optional: true },
        update: { type: Function },
        values: { type: Array },
        visibleItemsLimit: { type: Number, optional: true },
    };
    static defaultProps = {
        context: {},
        domain: () => [],
        id: "",
        nameCreateField: "name",
        placeholder: "",
        readonly: false,
        string: "",
        visibleItemsLimit: Number.POSITIVE_INFINITY,
    };

    get many2xAutocompleteProps() {
        return {
            activeActions: null,
            autoSelect: true,
            context: this.props.context,
            fieldString: this.props.string,
            getDomain: this.props.domain,
            id: this.props.id,
            isToMany: true,
            nameCreateField: this.props.nameCreateField,
            placeholder: this.props.values.length ? "" : this.props.placeholder,
            quickCreate: null,
            resModel: this.props.relation,
            searchThreshold: this.props.searchThreshold,
            specification: this.props.specification,
            update: null,
        };
    }

    get tagsListProps() {
        return {
            tags: this.props.values,
            visibleItemsLimit: this.props.visibleItemsLimit,
        };
    }

    setup() {
        useTagNavigation("root", {
            isEnabled: () => !this.props.readonly,
            delete: (index) => {},
        });
    }

    add(value) {
        return this.props.update({
            add: [value],
            remove: [],
        });
    }

    remove(value) {
        return this.props.update({
            add: [],
            remove: [value],
        });
    }

    isSelected(value) {
        return this.props.values.some((v) => v.resId === value.id);
    }
}

export class KanbanMany2ManyTags extends Component {
    static template = "web.KanbanMany2ManyTags";
    static components = { TagsList };
    static props = {
        readonly: { type: Boolean, optional: true },
        relation: { type: String },
        slots: { type: Object },
        update: { type: Function },
        values: { type: Array },
        visibleItemsLimit: { type: Number, optional: true },
    };
    static defaultProps = {
        readonly: false,
        visibleItemsLimit: 3,
    };

    get tagsListProps() {
        return {
            tags: this.props.values,
            visibleItemsLimit: this.props.visibleItemsLimit,
        };
    }
}
