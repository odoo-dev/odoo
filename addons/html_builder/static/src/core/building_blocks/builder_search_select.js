import { useRef, useSubEnv } from "@web/owl2/utils";
import { Component, onMounted, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { Dropdown } from "@web/core/dropdown/dropdown";
import {
    basicContainerBuilderComponentProps,
    useVisibilityObserver,
    useApplyVisibility,
    useSelectableComponent,
} from "../utils";
import { BuilderComponent } from "./builder_component";
import { BuilderSelectItem } from "./builder_select_item";
import { WithIgnoreItem } from "./builder_select";
import { useDropdownState } from "@web/core/dropdown/dropdown_hooks";
import { setElementContent } from "@web/core/utils/html";

/**
 * @typedef SearchSelectItem
 * @property {string} label - text displayed for the item (used to resolve the
 *      toggle button label and matched against the search value).
 * @property {string} [category] - optional category header. When the category
 *      of an item differs from the previous shown item's category, a header
 *      is inserted before the item.
 * @property {string} [id]
 * @property {string} [title]
 * @property {string} [className]
 * @property {string} [action]
 * @property {string|number|boolean} [actionValue]
 * @property {string|Object} [actionParam]
 * @property {string} [classAction]
 * @property {string} [styleAction]
 * @property {string} [styleActionValue]
 * @property {string} [attributeAction]
 * @property {string} [attributeActionValue]
 * @property {string} [dataAttributeAction]
 * @property {string} [dataAttributeActionValue]
 */

const ITEM_PROP_KEYS = [
    "id",
    "title",
    "label",
    "className",
    "action",
    "actionValue",
    "actionParam",
    "classAction",
    "styleAction",
    "styleActionValue",
    "attributeAction",
    "attributeActionValue",
    "dataAttributeAction",
    "dataAttributeActionValue",
];

export class BuilderSearchSelect extends Component {
    static template = "html_builder.BuilderSearchSelect";
    static props = {
        ...basicContainerBuilderComponentProps,
        getItems: { type: Function },
        className: { type: String, optional: true },
        dropdownContainerClass: { type: String, optional: true },
        dropdownClass: { type: String, optional: true },
        disabled: { type: Boolean, optional: true },
        searchPlaceholder: { type: String, optional: true },
        noResultsLabel: { type: String, optional: true },
        slots: {
            type: Object,
            optional: true,
            shape: {
                fixedButton: { type: Object, optional: true },
            },
        },
    };
    static defaultProps = {
        dropdownClass: "o-hb-select-dropdown o-hb-search-select-dropdown",
    };
    static components = {
        Dropdown,
        BuilderComponent,
        BuilderSelectItem,
        WithIgnoreItem,
    };

    setup() {
        useVisibilityObserver("content", useApplyVisibility("root"));

        this.state = useState({ searchValue: "" });

        const searchInputRef = useRef("searchInput");
        this.dropdown = useDropdownState({
            onClose: () => {
                this.state.searchValue = "";
            },
        });
        this.onDropdownOpened = () => {
            searchInputRef.el?.focus();
        };

        const buttonRef = useRef("button");
        let currentLabel;
        const updateCurrentLabel = () => {
            if (!this.props.slots?.fixedButton) {
                const newHtml = currentLabel || _t("None");
                if (buttonRef.el && buttonRef.el.innerHTML !== newHtml) {
                    setElementContent(buttonRef.el, newHtml);
                }
            }
        };
        useSelectableComponent(this.props.id, {
            onItemChange(item) {
                currentLabel = item.getLabel();
                updateCurrentLabel();
            },
        });
        onMounted(updateCurrentLabel);

        useSubEnv({
            onSelectItem: () => {
                this.dropdown.close();
            },
        });
    }

    get searchPlaceholder() {
        return this.props.searchPlaceholder ?? _t("Search...");
    }

    get noResultsLabel() {
        return this.props.noResultsLabel ?? _t("No results");
    }

    /**
     * Items rendered (invisible) to keep them mounted and resolve the toggle
     * label regardless of the current search value.
     * @returns {SearchSelectItem[]}
     */
    get allItems() {
        return this.props.getItems("") || [];
    }

    /**
     * Items rendered inside the open dropdown, filtered by the search input.
     * @returns {SearchSelectItem[]}
     */
    get filteredItems() {
        return this.props.getItems(this.state.searchValue) || [];
    }

    getItemProps(item) {
        const props = {};
        for (const key of ITEM_PROP_KEYS) {
            if (item[key] !== undefined) {
                props[key] = item[key];
            }
        }
        if (!props.label && typeof item.label === "string") {
            props.label = item.label;
        }
        return props;
    }

    getItemKey(item, index) {
        return item.id ?? item.actionValue ?? item.label ?? index;
    }

    /**
     * Whether the category header should be rendered before the given item.
     * A header is rendered when the item's category differs from the previous
     * shown item's category.
     */
    shouldRenderCategory(items, index) {
        const category = items[index]?.category;
        if (!category) {
            return false;
        }
        return index === 0 || items[index - 1].category !== category;
    }

    onSearchInput(ev) {
        this.state.searchValue = ev.target.value;
    }

    onSearchKeydown(ev) {
        if (ev.key === "Escape") {
            if (this.state.searchValue) {
                ev.stopPropagation();
                this.state.searchValue = "";
            }
        }
    }
}
