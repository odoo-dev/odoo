/** @odoo-module **/

import { browser } from "@web/core/browser/browser";
import { registry } from "@web/core/registry";
import { CheckBoxDropdownItem } from "@web/core/dropdown/checkbox_dropdown_item";
import { Field } from "@web/fields/field";

const { Component, useState } = owl;

const formatterRegistry = registry.category("formatters");

const FIELD_CLASSES = {
    char: "o_list_char",
    float: "o_list_number",
    integer: "o_list_number",
    monetary: "o_list_number",
    text: "o_list_text",
    many2one: "o_list_many2one",
};

const DEFAULT_GROUP_PAGER_COLSPAN = 1;

export class ListRenderer extends Component {
    setup() {
        this.fields = this.props.fields;
        this.allColumns = this.props.info.columns;
        this.keyOptionalFields = this.createKeyOptionalFields();
        this.getOptionalActiveFields();
        this.activeActions = this.props.info.activeActions;
        this.cellClassByColumn = {};
        this.selection = [];
        this.state = useState({
            columns: this.allColumns.filter(
                (col) => !col.optional || this.optionalActiveFields[col.name]
            ),
        });
    }

    willUpdateProps() {
        this.selection = [];
    }

    createKeyOptionalFields() {
        const keyParts = {
            fields: this.props.list.fieldNames,
            model: this.props.list.resModel,
            viewMode: "list",
            viewId: this.env.config.viewId,
        };

        const parts = [
            "model",
            "viewMode",
            "viewId",
            "relationalField",
            "subViewType",
            "subViewId",
        ];
        const viewIdentifier = ["optional_fields"];
        parts.forEach((partName) => {
            if (partName in keyParts) {
                viewIdentifier.push(keyParts[partName]);
            }
        });
        keyParts.fields
            .sort((left, right) => (left < right ? -1 : 1))
            .forEach((fieldName) => {
                return viewIdentifier.push(fieldName);
            });
        return viewIdentifier.join(",");
    }

    get getOptionalFields() {
        return this.allColumns
            .filter((col) => col.optional)
            .map((col) => ({
                string: col.string,
                name: col.name,
                value: this.optionalActiveFields[col.name],
            }));
    }

    nbRecordsInGroup(group) {
        if (group.isFolded) {
            return 0;
        } else if (group.list.isGrouped) {
            let count = 0;
            for (const gr of group.list.groups) {
                count += this.nbRecordsInGroup(gr);
            }
            return count;
        } else {
            return group.list.records.length;
        }
    }
    get selectAll() {
        let nbDisplayedRecords = this.props.list.records.length;
        return nbDisplayedRecords > 0 && this.selection.length === nbDisplayedRecords;
    }

    get aggregates() {
        let values;
        if (this.selection.length) {
            values = this.selection.map((r) => r.data);
        } else if (this.props.list.isGrouped) {
            values = this.props.list.groups.map((g) => g.aggregates);
        } else {
            values = this.props.list.records.map((r) => r.data);
        }
        const aggregates = {};
        for (const fieldName in this.props.list.activeFields) {
            const field = this.props.list.fields[fieldName];
            const type = field.type;
            if (type !== "integer" && type !== "float" && type !== "monetary") {
                continue;
            }
            const attrs = this.props.list.activeFields[fieldName].attrs;
            const func =
                (attrs.sum && "sum") ||
                (attrs.avg && "avg") ||
                (attrs.max && "max") ||
                (attrs.min && "min");
            if (func) {
                let count = 0;
                let aggregateValue = 0;
                if (func === "max") {
                    aggregateValue = -Infinity;
                } else if (func === "min") {
                    aggregateValue = Infinity;
                }
                for (const vals of values) {
                    count += 1;
                    const value = vals[fieldName];
                    if (func === "avg" || func === "sum") {
                        aggregateValue += value;
                    } else if (func === "max") {
                        aggregateValue = Math.max(aggregateValue, value);
                    } else if (func === "min") {
                        aggregateValue = Math.min(aggregateValue, value);
                    }
                }
                if (func === "avg") {
                    aggregateValue = count > 0 ? aggregateValue / count : aggregateValue;
                }
                const formatter = formatterRegistry.get(type, false);
                aggregates[fieldName] = {
                    help: attrs[func],
                    value: formatter ? formatter(aggregateValue) : aggregateValue,
                };
            }
        }
        return aggregates;
    }

    getGroupLevel(group) {
        return this.props.list.groupBy.length - group.list.groupBy.length - 1;
    }

    getColumnClass(column) {
        const field = this.fields[column.name];
        const classNames = [];
        if (field.sortable) {
            classNames.push("o_column_sortable");
        }
        const orderedBy = this.props.list.orderedBy || {};
        if (column.name === orderedBy.name) {
            classNames.push(orderedBy.asc ? "o-sort-up" : "o-sort-down");
        }
        if (["float", "integer", "monetary"].includes(field.type)) {
            classNames.push("o_list_number_th");
        }
        return classNames.join(" ");
    }

    getCellClass(column) {
        if (!this.cellClassByColumn[column.name]) {
            const classNames = ["o_data_cell"];
            if (column.type === "button_group") {
                classNames.push("o_list_button");
            } else if (column.type === "field") {
                classNames.push("o_field_cell");
                const typeClass = FIELD_CLASSES[this.fields[column.name].type];
                if (typeClass) {
                    classNames.push(typeClass);
                }
                if (column.widget) {
                    classNames.push("o_" + column.widget + "_cell");
                }
            }
            this.cellClassByColumn[column.name] = classNames.join(" ");
        }
        return this.cellClassByColumn[column.name];
    }

    // Group headers logic:
    // if there are aggregates, the first th spans until the first
    // aggregate column then all cells between aggregates are rendered
    // a single cell is rendered after the last aggregated column to render the
    // pager (with adequate colspan)
    // ex:
    // TH TH TH TH TH AGG AGG TH AGG AGG TH TH TH
    // 0  1  2  3  4   5   6   7  8   9  10 11 12
    // [    TH 5    ][TH][TH][TH][TH][TH][ TH 3 ]
    // [ group name ][ aggregate cells  ][ pager]
    // TODO: move this somewhere, compute this only once (same result for each groups actually) ?
    getFirstAggregateIndex(group) {
        return this.allColumns.findIndex((col) => col.name in group.aggregates);
    }
    getLastAggregateIndex(group) {
        const reversedColumns = [...this.allColumns].reverse(); // reverse is destructive
        const index = reversedColumns.findIndex((col) => col.name in group.aggregates);
        return index > -1 ? this.allColumns.length - index - 1 : -1;
    }
    getAggregateColumns(group) {
        const firstIndex = this.getFirstAggregateIndex(group);
        const lastIndex = this.getLastAggregateIndex(group);
        return this.allColumns.slice(firstIndex, lastIndex + 1);
    }
    getGroupNameCellColSpan(group) {
        // if there are aggregates, the first th spans until the first
        // aggregate column then all cells between aggregates are rendered
        const firstAggregateIndex = this.getFirstAggregateIndex(group);
        let colspan;
        if (firstAggregateIndex > -1) {
            colspan = firstAggregateIndex;
        } else {
            colspan = Math.max(1, this.allColumns.length - DEFAULT_GROUP_PAGER_COLSPAN);
        }
        return this.props.hasSelectors ? colspan + 1 : colspan;
    }
    getGroupPagerCellColspan(group) {
        const lastAggregateIndex = this.getLastAggregateIndex(group);
        if (lastAggregateIndex > -1) {
            return this.allColumns.length - lastAggregateIndex - 1;
        } else {
            return this.allColumns.length > 1 ? DEFAULT_GROUP_PAGER_COLSPAN : 0;
        }
    }

    getOptionalActiveFields() {
        this.optionalActiveFields = {};
        let optionalActiveFields = browser.localStorage[this.keyOptionalFields];
        if (optionalActiveFields) {
            optionalActiveFields = optionalActiveFields.split(",");
            this.allColumns.forEach((col) => {
                this.optionalActiveFields[col.name] = optionalActiveFields.includes(col.name);
            });
        } else {
            this.allColumns.forEach((col) => {
                this.optionalActiveFields[col.name] = col.optional === "show";
            });
        }
    }

    onClickSortColumn(fieldName) {
        this.props.list.sortBy(fieldName);
    }

    openRecord(record) {
        this.props.openRecord(record);
    }

    saveOptionalActiveFields() {
        browser.localStorage[this.keyOptionalFields] = Object.keys(
            this.optionalActiveFields
        ).filter((fieldName) => this.optionalActiveFields[fieldName]);
    }

    toggleGroup(group) {
        group.toggle();
    }

    toggleSelection() {
        if (this.selection.length === this.props.list.records.length) {
            this.selection = [];
        } else {
            this.selection = [...this.props.list.records];
        }
        this.render();
    }
    toggleRecordSelection(record) {
        const index = this.selection.indexOf(record);
        if (index > -1) {
            this.selection.splice(index, 1);
        } else {
            this.selection.push(record);
        }
        this.render();
    }
    toggleOptionalField(ev) {
        const fieldName = ev.detail.payload.name;
        this.optionalActiveFields[fieldName] = !this.optionalActiveFields[fieldName];
        this.state.columns = this.allColumns.filter(
            (col) => !col.optional || this.optionalActiveFields[col.name]
        );
        this.saveOptionalActiveFields(
            this.allColumns.filter((col) => this.optionalActiveFields[col.name] && col.optional)
        );
    }
}

ListRenderer.template = "web.ListRenderer";
ListRenderer.components = { CheckBoxDropdownItem, Field };
