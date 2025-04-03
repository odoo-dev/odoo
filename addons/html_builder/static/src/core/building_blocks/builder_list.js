import { BuilderComponent } from "@html_builder/core/building_blocks/builder_component";
import {
    basicContainerBuilderComponentProps,
    useBuilderComponent,
    useInputBuilderComponent,
} from "@html_builder/core/utils";
import { Component, useRef } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { useSortable } from "@web/core/utils/sortable_owl";

const supportedEntryShapeTypes = ["text", "number"];

export class BuilderList extends Component {
    static template = "html_builder.BuilderList";
    static props = {
        ...basicContainerBuilderComponentProps,
        id: { type: String, optional: true },
        addItemTitle: { type: String, optional: true },
        entryShape: { type: Object, optional: true },
        defaultValue: { optional: true },
        sortable: { optional: true },
    };
    static defaultProps = {
        addItemTitle: _t("Add"),
        entryShape: { value: "text" },
        defaultValue: { value: _t("Item") },
        sortable: true,
    };
    static components = { BuilderComponent };

    setup() {
        this.validateProps();

        useBuilderComponent();
        const { state, commit, preview } = useInputBuilderComponent({
            id: this.props.id,
            defaultValue: this.parseDisplayValue([this.makeDefaultItem()]),
            parseDisplayValue: this.parseDisplayValue,
            formatRawValue: this.formatRawValue,
        });
        this.state = state;
        this.commit = commit;
        this.preview = preview;

        if (this.props.sortable) {
            useSortable({
                enable: () => this.props.sortable,
                ref: useRef("table"),
                elements: ".o_row_draggable",
                handle: ".o_handle_cell",
                cursor: "grabbing",
                placeholderClasses: ["d-table-row"],
                onDrop: (params) => {
                    const { element, previous } = params;
                    this.reorderItem(element.dataset.id, previous?.dataset.id);
                },
            });
        }
    }

    validateProps() {
        // entryShape types are supported
        for (const [name, type] of Object.entries(this.props.entryShape)) {
            if (!supportedEntryShapeTypes.includes(type)) {
                throw new Error(
                    `BuilderList entryShape only supports ${supportedEntryShapeTypes.toString()} types, received ${name}: "${type}"`
                );
            }
        }

        // entryShape not empty object
        const entryShapeKeys = Object.keys(this.props.entryShape);
        if (entryShapeKeys.length === 0) {
            throw new Error("entryShape cannot be an empty object");
        }

        // keys match
        const defaultValueKeys = Object.keys(this.props.defaultValue);
        const allKeys = new Set([...entryShapeKeys, ...defaultValueKeys]);
        if (allKeys.size !== entryShapeKeys.length) {
            throw new Error("defaultValue properties don't match entryShape");
        }

        // keys don't contain reserved "_id"
        if (allKeys.has("_id")) {
            throw new Error("_id cannot be used in entryShape");
        }
    }

    parseDisplayValue(displayValue) {
        return JSON.stringify(displayValue);
    }

    formatRawValue(rawValue) {
        const items = rawValue ? JSON.parse(rawValue) : [];
        for (const item of items) {
            if (!("_id" in item)) {
                item._id = this.getNextAvailableEntryId(items);
            }
        }
        return items;
    }

    addItem() {
        const items = this.formatRawValue(this.state.value);
        items.push(this.makeDefaultItem());
        this.commit(items);
    }

    deleteItem(e) {
        const itemId = e.target.dataset.id;
        const items = this.formatRawValue(this.state.value);
        this.commit(items.filter((item) => item._id !== itemId));
    }

    reorderItem(itemId, previousId) {
        let items = this.formatRawValue(this.state.value);
        const itemToReorder = items.find((item) => item._id === itemId);
        items = items.filter((item) => item._id !== itemId);

        const previousItem = items.find((item) => item._id === previousId);
        const previousItems = items.slice(0, items.indexOf(previousItem) + 1);

        const nextItems = items.slice(items.indexOf(previousItem) + 1, items.length);

        const newItems = [...previousItems, itemToReorder, ...nextItems];
        this.commit(newItems);
    }

    makeDefaultItem() {
        return {
            ...this.props.defaultValue,
            _id: this.getNextAvailableEntryId(),
        };
    }

    getNextAvailableEntryId(items) {
        items = items || this.formatRawValue(this.state?.value);
        const biggestId = items
            .map((item) => parseInt(item._id))
            .reduce((acc, id) => (id > acc ? id : acc), -1);
        const nextAvailableId = biggestId + 1;
        return nextAvailableId.toString();
    }

    onInput(e) {
        this.handleValueChange(e.target, false);
    }

    onChange(e) {
        this.handleValueChange(e.target, true);
    }

    handleValueChange(targetInputEl, commitToHistory) {
        const id = targetInputEl.dataset.id;
        const propertyName = targetInputEl.name;
        const value = targetInputEl.value;

        const items = this.formatRawValue(this.state.value);
        const item = items.find((item) => item._id === id);
        item[propertyName] = value;

        if (commitToHistory) {
            this.commit(items);
        } else {
            this.preview(items);
        }
    }
}
