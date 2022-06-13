/** @odoo-module **/

import { browser } from "@web/core/browser/browser";
import { CheckBox } from "@web/core/checkbox/checkbox";
import { Domain } from "@web/core/domain";
import { CheckBoxDropdownItem } from "@web/core/dropdown/checkbox_dropdown_item";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { Pager } from "@web/core/pager/pager";
import { evaluateExpr } from "@web/core/py_js/py";
import { registry } from "@web/core/registry";
import { useBus, useService } from "@web/core/utils/hooks";
import { getTabableElements, useSortable } from "@web/core/utils/ui";
import { Field } from "@web/fields/field";
import { Group } from "@web/views/relational_model";
import { ViewButton } from "@web/views/view_button/view_button";
import { useBounceButton } from "../helpers/view_hook";
import { getTooltipInfo } from "../../fields/field_tooltip";
import { getActiveHotkey } from "@web/core/hotkeys/hotkey_service";

const {
    Component,
    onMounted,
    onPatched,
    onWillPatch,
    onWillUpdateProps,
    useExternalListener,
    useRef,
    useState,
    useEffect,
} = owl;

const formatters = registry.category("formatters");

const DEFAULT_GROUP_PAGER_COLSPAN = 1;

const FIELD_CLASSES = {
    char: "o_list_char",
    float: "o_list_number",
    integer: "o_list_number",
    monetary: "o_list_number",
    text: "o_list_text",
    many2one: "o_list_many2one",
};

const FIXED_FIELD_COLUMN_WIDTHS = {
    boolean: "70px",
    date: "92px",
    datetime: "146px",
    float: "92px",
    integer: "74px",
    monetary: "104px",
    handle: "33px",
};

function getElementToFocus(cell) {
    return getTabableElements(cell)[0] || cell;
}

export class ListRenderer extends Component {
    setup() {
        this.uiService = useService("ui");
        this.allColumns = this.props.archInfo.columns;
        this.keyOptionalFields = this.createKeyOptionalFields();
        this.getOptionalActiveFields();
        this.cellClassByColumn = {};
        this.groupByButtons = this.props.archInfo.groupBy.buttons;
        this.state = useState({
            columns: this.allColumns.filter(
                (col) => !col.optional || this.optionalActiveFields[col.name]
            ),
        });
        this.withHandleColumn = this.state.columns.some((col) => col.widget === "handle");
        useExternalListener(document, "click", this.onGlobalClick.bind(this));
        this.tableRef = useRef("table");

        this.creates = this.props.archInfo.creates.length
            ? this.props.archInfo.creates
            : [{ description: this.env._t("Add a line") }];

        this.cellToFocus = null;
        this.activeRowId = null;
        onMounted(() => {
            this.activeElement = this.uiService.activeElement;
        });
        onWillPatch(() => {
            const activeRow = document.activeElement.closest(".o_data_row.o_selected_row");
            this.activeRowId = activeRow ? activeRow.dataset.id : null;
        });
        onWillUpdateProps((nextProps) => {
            this.allColumns = nextProps.archInfo.columns;
            this.state.columns = this.allColumns.filter(
                (col) => !col.optional || this.optionalActiveFields[col.name]
            );
        });
        onPatched(() => {
            const editedRecord = this.props.list.editedRecord;
            if (editedRecord && this.activeRowId !== editedRecord.id) {
                let column = this.state.columns[0];
                if (this.cellToFocus && this.cellToFocus.record === editedRecord) {
                    column = this.cellToFocus.column;
                }
                this.focusCell(column);
            }
            this.cellToFocus = null;
        });
        let dataRowId;
        this.rootRef = useRef("root");
        this.resequencePromise = Promise.resolve();
        useSortable({
            enable: () => this.canResequenceRows,
            // Params
            ref: this.rootRef,
            elements: ".o_row_draggable",
            handle: ".o_handle_cell",
            cursor: "grabbing",
            // Hooks
            onStart: (_group, element) => {
                dataRowId = element.dataset.id;
                element.classList.add("o_dragged");
            },
            onStop: (_group, element) => element.classList.remove("o_dragged"),
            onDrop: async ({ element, previous }) => {
                if (this.props.list.editedRecord) {
                    // bof
                    this.props.list.editedRecord.switchMode("readonly");
                    // there was more see unselectRow in list_editable_renderer called with no options
                }
                element.classList.remove("o_row_draggable");
                const refId = previous ? previous.dataset.id : null;
                this.resequencePromise = this.props.list.resequence(dataRowId, refId, {
                    handleField: this.props.archInfo.handleField,
                });
                await this.resequencePromise;
                element.classList.add("o_row_draggable");
            },
        });

        if (this.env.searchModel) {
            useBus(this.env.searchModel, "focus-view", () => {
                if (this.props.list.model.useSampleModel || !this.showTable) {
                    return;
                }

                const nextTh = this.tableRef.el.querySelector("thead th");
                const toFocus = getElementToFocus(nextTh);
                toFocus.focus();
                this.tableRef.el.querySelector("tbody").classList.add("o_keyboard_navigation");
            });
        }
        useBounceButton(this.rootRef, () => {
            return this.showNoContentHelper;
        });
        useEffect(
            (editedRecord) => {
                if (editedRecord) {
                    this.keepColumnWidths = true;
                }
            },
            () => [this.props.list.editedRecord]
        );
        useEffect(
            () => {
                this.freezeColumnWidths();
            },
            () => [this.state.columns, this.isEmpty, this.showTable]
        );
        useExternalListener(window, "resize", () => {
            this.columnWidths = null;
            this.freezeColumnWidths();
        });
    }

    // The following code manipulates the DOM directly to avoid having to wait for a
    // render + patch which would occur on the next frame and cause flickering.
    freezeColumnWidths() {
        if (!this.showTable) {
            return;
        }
        if (!this.keepColumnWidths) {
            this.columnWidths = null;
        }

        const table = this.tableRef.el;
        const headers = [...table.querySelectorAll("thead th")];

        if (!this.columnWidths || !this.columnWidths.length) {
            // no column widths to restore
            // Set table layout auto and remove inline style to make sure that css
            // rules apply (e.g. fixed width of record selector)
            table.style.tableLayout = "auto";
            headers.forEach((th) => {
                th.style.width = null;
                th.style.maxWidth = null;
            });

            this.setDefaultColumnWidths();

            // Squeeze the table by applying a max-width on largest columns to
            // ensure that it doesn't overflow
            this.columnWidths = this.computeColumnWidthsFromContent();
            table.style.tableLayout = "fixed";
        }
        headers.forEach((th, index) => {
            if (!th.style.width) {
                th.style.width = `${this.columnWidths[index]}px`;
            }
        });
    }

    setDefaultColumnWidths() {
        const widths = this.state.columns.map((col) => this.calculateColumnWidth(col));
        const sumOfRelativeWidths = widths
            .filter(({ type }) => type === "relative")
            .reduce((sum, { value }) => sum + value, 0);

        // 1 because nth-child selectors are 1-indexed, 2 when the first column contains
        // the checkboxes to select records.
        const columnOffset = this.props.hasSelectors ? 2 : 1;
        widths.forEach(({ type, value }, i) => {
            const headerEl = this.tableRef.el.querySelector(`th:nth-child(${i + columnOffset})`);
            if (type === "absolute") {
                if (this.isEmpty) {
                    headerEl.style.width = value;
                } else {
                    headerEl.style.minWidth = value;
                }
            } else if (type === "relative" && this.isEmpty) {
                headerEl.style.width = `${((value / sumOfRelativeWidths) * 100).toFixed(2)}%`;
            }
        });
    }

    computeColumnWidthsFromContent() {
        const table = this.tableRef.el;

        // Toggle a className used to remove style that could interfer with the ideal width
        // computation algorithm (e.g. prevent text fields from being wrapped during the
        // computation, to prevent them from being completely crushed)
        table.classList.add("o_list_computing_widths");

        const headers = [...table.querySelectorAll("thead th")];
        const columnWidths = headers.map((th) => th.offsetWidth);
        const getWidth = (th) => columnWidths[headers.indexOf(th)] || 0;
        const getTotalWidth = () => columnWidths.reduce((tot, width) => tot + width, 0);
        const shrinkColumns = (thsToShrink, shrinkAmount) => {
            let canKeepShrinking = true;
            for (const th of thsToShrink) {
                const index = headers.indexOf(th);
                let maxWidth = columnWidths[index] - shrinkAmount;
                // prevent the columns from shrinking under 92px (~ date field)
                if (maxWidth < 92) {
                    maxWidth = 92;
                    canKeepShrinking = false;
                }
                th.style.maxWidth = `${maxWidth}px`;
                columnWidths[index] = maxWidth;
            }
            return canKeepShrinking;
        };
        // Sort columns, largest first
        const sortedThs = [...table.querySelectorAll("thead th:not(.o_list_button)")].sort(
            (a, b) => getWidth(b) - getWidth(a)
        );
        const allowedWidth = table.parentNode.offsetWidth;

        let totalWidth = getTotalWidth();
        for (let index = 1; totalWidth > allowedWidth; index++) {
            // Find the largest columns
            const largestCols = sortedThs.slice(0, index);
            const currentWidth = getWidth(largestCols[0]);
            for (; currentWidth === getWidth(sortedThs[index]); index++) {
                largestCols.push(sortedThs[index]);
            }

            // Compute the number of px to remove from the largest columns
            const nextLargest = sortedThs[index];
            const toRemove = Math.ceil((totalWidth - allowedWidth) / largestCols.length);
            const shrinkAmount = Math.min(toRemove, currentWidth - getWidth(nextLargest));

            // Shrink the largest columns
            const canKeepShrinking = shrinkColumns(largestCols, shrinkAmount);
            if (!canKeepShrinking) {
                break;
            }

            totalWidth = getTotalWidth();
        }

        // We are no longer computing widths, so restore the normal style
        table.classList.remove("o_list_computing_widths");
        return columnWidths;
    }

    get canResequenceRows() {
        if (!this.props.list.canResequence()) {
            return false;
        }
        const orderBy = this.props.list.orderBy;
        const handleField = this.props.archInfo.handleField;
        return !orderBy.length || (orderBy.length && orderBy[0].name === handleField);
    }

    /**
     * No records, no groups.
     */
    get isEmpty() {
        return !this.props.list.records.length;
    }

    get fields() {
        return this.props.list.fields;
    }

    canUseFormatter(column, record) {
        return (
            !record.isInEdition && !column.widget && record.fields[column.name].type !== "boolean"
        );
    }

    focusCell(column) {
        let index = this.state.columns.indexOf(column);
        if (index === -1) {
            index = 0;
        }
        const columns = [
            ...this.state.columns.slice(index, this.state.columns.length),
            ...this.state.columns.slice(0, index),
        ];
        const editedRecord = this.props.list.editedRecord;
        for (const column of columns) {
            if (column.type !== "field") {
                continue;
            }
            const fieldName = column.name;
            if (!editedRecord.isReadonly(fieldName)) {
                const cell = this.tableRef.el.querySelector(
                    `.o_selected_row td[name=${fieldName}]`
                );
                if (cell) {
                    const toFocus = getElementToFocus(cell);
                    if (toFocus) {
                        toFocus.focus();
                        if (["INPUT", "TEXTAREA"].includes(toFocus.tagName)) {
                            toFocus.select();
                        }
                        break;
                    }
                }
            }
        }
    }

    editGroupRecord(group) {
        const { resId, resModel } = group.record;
        this.env.services.action.doAction({
            context: {
                create: false,
            },
            res_model: resModel,
            res_id: resId,
            type: "ir.actions.act_window",
            views: [[false, "form"]],
            flags: { mode: "edit" },
        });
    }

    createKeyOptionalFields() {
        let keyParts = {
            fields: this.props.list.fieldNames,
            model: this.props.list.resModel,
            viewMode: "list",
            viewId: this.env.config.viewId,
        };

        if (this.props.nestedKeyOptionalFieldsData) {
            keyParts = Object.assign(keyParts, {
                model: this.props.nestedKeyOptionalFieldsData.model,
                viewMode: this.props.nestedKeyOptionalFieldsData.viewMode,
                relationalField: this.props.nestedKeyOptionalFieldsData.field,
                subViewType: "list",
            });
        }

        const parts = ["model", "viewMode", "viewId", "relationalField", "subViewType"];
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
        const list = this.props.list;
        const nbDisplayedRecords = list.records.length;
        if (list.isDomainSelected) {
            return true;
        } else {
            return nbDisplayedRecords > 0 && list.selection.length === nbDisplayedRecords;
        }
    }

    get aggregates() {
        let values;
        if (this.props.list.selection && this.props.list.selection.length) {
            values = this.props.list.selection.map((r) => r.data);
        } else if (this.props.list.isGrouped) {
            values = this.props.list.groups.map((g) => g.aggregates);
        } else {
            values = this.props.list.records.map((r) => r.data);
        }
        const aggregates = {};
        for (const fieldName in this.props.list.activeFields) {
            const field = this.fields[fieldName];
            const fieldValues = [];
            for (const value of values) {
                const fieldValue = value[fieldName];
                if (fieldValue) {
                    fieldValues.push(fieldValue);
                }
            }
            if (!fieldValues.length) {
                continue;
            }
            const type = field.type;
            if (type !== "integer" && type !== "float" && type !== "monetary") {
                continue;
            }
            const { attrs, widget } = this.props.list.activeFields[fieldName];
            const func =
                (attrs.sum && "sum") ||
                (attrs.avg && "avg") ||
                (attrs.max && "max") ||
                (attrs.min && "min");
            if (func) {
                let aggregateValue = 0;
                if (func === "max") {
                    aggregateValue = Math.max(-Infinity, ...fieldValues);
                } else if (func === "min") {
                    aggregateValue = Math.min(Infinity, ...fieldValues);
                } else if (func === "avg") {
                    aggregateValue =
                        fieldValues.reduce((acc, val) => acc + val) / fieldValues.length;
                } else if (func === "sum") {
                    aggregateValue = fieldValues.reduce((acc, val) => acc + val);
                }

                const formatter = formatters.get(widget, false) || formatters.get(type, false);
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
        if (field.sortable && column.hasLabel) {
            classNames.push("o_column_sortable");
        }
        const orderBy = this.props.list.orderBy;
        if (orderBy.length && orderBy[0].name === column.name) {
            classNames.push(orderBy[0].asc ? "o-sort-up" : "o-sort-down");
        }
        if (["float", "integer", "monetary"].includes(field.type)) {
            classNames.push("o_list_number_th");
        }
        if (column.type === "button_group") {
            classNames.push("o_list_button");
        }
        // note: remove this oe_read/edit_only logic when form view
        // will always be in edit mode
        if (/\boe_edit_only\b/.test(column.className)) {
            classNames.push("oe_edit_only");
        } else if (/\boe_read_only\b/.test(column.className)) {
            classNames.push("oe_read_only");
        }
        if (column.widget) {
            classNames.push(`o_${column.widget}_cell`);
        }

        return classNames.join(" ");
    }

    /**
     * Returns the classnames to apply to the row representing the given record.
     * @param {Record} record
     * @returns {string}
     */
    getRowClass(record) {
        // classnames coming from decorations
        const classNames = this.props.archInfo.decorations
            .filter((decoration) => evaluateExpr(decoration.condition, record.evalContext))
            .map((decoration) => decoration.class);
        // "o_selected_row" classname for the potential row in edition
        if (record.isInEdition) {
            classNames.push("o_selected_row");
        }
        if (this.props.list.model.useSampleModel) {
            classNames.push("o_sample_data_disabled");
        }
        if (this.canResequenceRows) {
            classNames.push("o_row_draggable");
        }
        return classNames.join(" ");
    }

    getCellClass(column, record) {
        if (!this.cellClassByColumn[column.id]) {
            const classNames = ["o_data_cell"];
            if (column.type === "button_group") {
                classNames.push("o_list_button");
            } else if (column.type === "field") {
                classNames.push("o_field_cell");
                if (column.attrs && column.attrs.class) {
                    classNames.push(column.attrs.class);
                }
                const typeClass = FIELD_CLASSES[this.fields[column.name].type];
                if (typeClass) {
                    classNames.push(typeClass);
                }
                if (column.widget) {
                    classNames.push(`o_${column.widget}_cell`);
                }
            }
            this.cellClassByColumn[column.id] = classNames;
        }
        const classNames = [...this.cellClassByColumn[column.id]];
        if (column.type === "field") {
            if (record.isRequired(column.name)) {
                classNames.push("o_required_modifier");
            }
            if (record.isInvalid(column.name)) {
                classNames.push("o_invalid_cell");
            }
            if (this.canUseFormatter(column, record)) {
                // generate field decorations classNames (only if field-specific decorations
                // have been defined in an attribute, e.g. decoration-danger="other_field = 5")
                // only handle the text-decoration.
                const { decorations } = record.activeFields[column.name];
                for (const decoName in decorations) {
                    if (evaluateExpr(decorations[decoName], record.evalContext)) {
                        classNames.push(`text-${decoName}`);
                    }
                }
            }
        }
        return classNames.join(" ");
    }

    getCellTitle(column, record) {
        const fieldType = this.fields[column.name].type;
        // Because we freeze the column sizes, it may happen that we have to shorten
        // field values. In order for the user to have access to the complete value
        // in those situations, we put the value as title of the cells.
        // This is only necessary for some field types, as for the others, we hardcode
        // a minimum column width that should be enough to display the entire value.
        if (!(fieldType in FIXED_FIELD_COLUMN_WIDTHS)) {
            return this.getFormattedValue(column, record);
        }
    }

    getFormattedValue(column, record) {
        const fieldName = column.name;
        const field = this.fields[fieldName];
        const formatter = formatters.get(field.type, (val) => val);
        const formatOptions = {
            escape: false,
            data: record.data,
            isPassword: "password" in column.attrs,
            digits: column.attrs.digits ? JSON.parse(column.attrs.digits) : field.digits,
            field: record.fields[fieldName],
            timezone: true,
        };
        return formatter(record.data[fieldName], formatOptions);
    }

    evalModifier(modifier, record) {
        return !!(modifier && new Domain(modifier).contains(record.evalContext));
    }

    getGroupDisplayName(group) {
        const { _t } = this.env;
        if (group.groupByField.type === "boolean") {
            return group.value === undefined ? _t("None") : group.value ? _t("Yes") : _t("No");
        } else {
            return group.value === undefined || group.value === false
                ? _t("None")
                : group.displayName;
        }
    }

    get getEmptyRowIds() {
        const nbEmptyRow = Math.max(0, 4 - this.props.list.records.length);
        return Array.from(Array(nbEmptyRow).keys());
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
        return this.state.columns.findIndex((col) => col.name in group.aggregates);
    }
    getLastAggregateIndex(group) {
        const reversedColumns = [...this.state.columns].reverse(); // reverse is destructive
        const index = reversedColumns.findIndex((col) => col.name in group.aggregates);
        return index > -1 ? this.state.columns.length - index - 1 : -1;
    }
    getAggregateColumns(group) {
        const firstIndex = this.getFirstAggregateIndex(group);
        const lastIndex = this.getLastAggregateIndex(group);
        return this.state.columns.slice(firstIndex, lastIndex + 1);
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

    getGroupPagerProps(group) {
        const list = group.list;
        return {
            offset: list.offset,
            limit: list.limit,
            total: list.count,
            onUpdate: async ({ offset, limit }) => {
                await list.load({ limit, offset });
                this.render(true);
            },
            withAccessKey: false,
        };
    }

    getOptionalActiveFields() {
        this.optionalActiveFields = {};
        let optionalActiveFields = browser.localStorage.getItem(this.keyOptionalFields);
        if (optionalActiveFields) {
            this.allColumns.forEach((col) => {
                this.optionalActiveFields[col.name] = optionalActiveFields.includes(col.name);
            });
        } else {
            this.allColumns.forEach((col) => {
                this.optionalActiveFields[col.name] = col.optional === "show";
            });
        }
    }

    onClickSortColumn(column) {
        if (this.props.list.editedRecord || this.props.list.model.useSampleModel) {
            return;
        }
        const fieldName = column.name;
        const list = this.props.list;
        if (this.fields[fieldName].sortable && column.hasLabel) {
            if (list.isGrouped) {
                const isSortable =
                    list.groups[0].getAggregates(fieldName) || list.groupBy.includes(fieldName);
                if (isSortable) {
                    list.sortBy(fieldName);
                }
            } else {
                list.sortBy(fieldName);
            }
        }
    }

    onButtonCellClicked(record, column, ev) {
        if (!ev.target.closest("button")) {
            this.onCellClicked(record, column);
        }
    }

    async onCellClicked(record, column) {
        const recordAfterResequence = async () => {
            const recordIndex = this.props.list.records.indexOf(record);
            await this.resequencePromise;
            // row might have changed record after resequence
            record = this.props.list.records[recordIndex] || record;
        };

        if (this.props.list.model.multiEdit && record.selected) {
            await recordAfterResequence();
            await record.switchMode("edit");
            this.cellToFocus = { column, record };
        } else if (this.props.editable) {
            if (record.isInEdition) {
                this.focusCell(column);
                this.cellToFocus = null;
            } else {
                await recordAfterResequence();
                await record.switchMode("edit");
                this.cellToFocus = { column, record };
            }
        } else if (!this.props.archInfo.noOpen) {
            this.props.openRecord(record);
        }
    }

    async onDeleteRecord(record) {
        this.keepColumnWidths = true;
        const editedRecord = this.props.list.editedRecord;
        if (editedRecord && editedRecord !== record) {
            const unselected = await this.props.list.unselectRecord(true);
            if (!unselected) {
                return;
            }
        }
        this.props.activeActions.onDelete(record);
    }

    /**
     * @param {HTMLTableCellElement} cell
     * @param {boolean} isInGroupRow
     * @param {"up"|"down"|"left"|"right"} direction
     */
    findFutureCell(cell, isInGroupRow, direction) {
        const row = cell.parentElement;
        const children = [...row.children];
        const index = children.indexOf(cell);
        let futureCell;
        switch (direction) {
            case "up": {
                let futureRow = row.previousElementSibling;
                futureRow =
                    futureRow ||
                    (row.parentElement.previousElementSibling &&
                        row.parentElement.previousElementSibling.lastElementChild);

                if (futureRow) {
                    const nextIsGroup = futureRow.classList.contains("o_group_header");
                    const rowTypeSwitched = isInGroupRow !== nextIsGroup;
                    futureCell = futureRow && futureRow.children[rowTypeSwitched ? 0 : index];
                }
                break;
            }
            case "down": {
                let futureRow = row.nextElementSibling;
                futureRow =
                    futureRow ||
                    (row.parentElement.nextElementSibling &&
                        row.parentElement.nextElementSibling.firstElementChild);
                if (futureRow) {
                    const nextIsGroup = futureRow.classList.contains("o_group_header");
                    const rowTypeSwitched = isInGroupRow !== nextIsGroup;
                    futureCell = futureRow && futureRow.children[rowTypeSwitched ? 0 : index];
                }
                break;
            }
            case "left": {
                futureCell = children[index - 1];
                break;
            }
            case "right": {
                futureCell = children[index + 1];
                break;
            }
        }
        return futureCell;
    }

    /**
     * @param {KeyboardEvent} ev
     * @param { import('@web/views/relational_model').Group
     *  | import('@web/views/relational_model').Record
     *  | import('@web/views/basic_relational_model').Record
     * } dataPoint
     */
    onCellKeydown(ev, dataPoint) {
        if (this.props.list.model.useSampleModel) {
            return;
        }

        const hotkey = getActiveHotkey(ev);

        if (ev.target.tagName === "TEXTAREA" && hotkey === "enter") {
            return;
        }

        const closestCell = ev.target.closest("td, th");

        const handled = this.props.list.editedRecord
            ? this.onCellKeydownEditMode(hotkey, closestCell, dataPoint)
            : this.onCellKeydownReadOnlyMode(hotkey, closestCell, dataPoint);

        if (handled) {
            ev.preventDefault();
            ev.stopPropagation();
        }
    }

    findNextFocusableOnRow(row, cell) {
        const children = [...row.children];
        const index = children.indexOf(cell);
        const nextCells = children.slice(index + 1);
        for (const c of nextCells) {
            if (!c.classList.contains("o_data_cell")) {
                continue;
            }
            if (
                c.firstElementChild &&
                c.firstElementChild.classList.contains("o_readonly_modifier")
            ) {
                continue;
            }
            const toFocus = getElementToFocus(c);
            if (toFocus !== c) {
                return toFocus;
            }
        }
        return null;
    }

    findPreviousFocusableOnRow(row, cell) {
        const children = [...row.children];
        const index = children.indexOf(cell);
        const previousCells = children.slice(0, index);
        for (const c of previousCells.reverse()) {
            if (!c.classList.contains("o_data_cell")) {
                continue;
            }
            if (
                c.firstElementChild &&
                c.firstElementChild.classList.contains("o_readonly_modifier")
            ) {
                continue;
            }
            const toFocus = getElementToFocus(c);
            if (toFocus !== c) {
                return toFocus;
            }
        }
        return null;
    }

    /**
     * @param {string} hotkey
     * @param {HTMLTableCellElement} cell
     * @param { import('@web/views/relational_model').Record
     *  | import('@web/views/basic_relational_model').Record
     * } record
     * @returns {boolean} true if some behavior has been taken
     */
    onCellKeydownEditMode(hotkey, cell, record) {
        const { activeActions, cycleOnTab, editable, list } = this.props;
        const row = cell.parentElement;
        let toFocus = null;
        switch (hotkey) {
            case "tab":
                toFocus = this.findNextFocusableOnRow(row, cell);
                if (toFocus) {
                    toFocus.focus();
                    this.tableRef.el.querySelector("tbody").classList.add("o_keyboard_navigation");
                } else {
                    const applyMultiEditBehavior = record.selected && list.model.multiEdit;
                    if (applyMultiEditBehavior) {
                        if (!record.isDirty) {
                            const index = list.selection.indexOf(record);
                            const futureRecord = list.selection[index + 1] || list.selection[0];
                            if (record === futureRecord) {
                                // Refocus first cell of same record
                                toFocus = this.findNextFocusableOnRow(row);
                                toFocus.focus();
                            } else {
                                futureRecord.switchMode("edit");
                            }
                        }
                    } else {
                        const index = list.records.indexOf(record);
                        if (index === list.records.length - 1) {
                            if (
                                activeActions &&
                                (activeActions.canLink || activeActions.canCreate)
                            ) {
                                if (record.isNew && !record.isDirty) {
                                    list.unselectRecord(true);
                                    return false;
                                }
                                // add a line
                                if (record.checkValidity()) {
                                    const { context } = this.creates[0];
                                    this.props.onAdd(context);
                                }
                            } else if (activeActions.create && record.isDirty) {
                                if (record.checkValidity()) {
                                    this.props.onAdd();
                                }
                            } else if (cycleOnTab) {
                                if (record.isNew && !record.isDirty) {
                                    list.unselectRecord(true);
                                }
                                const futureRecord = list.records[0];
                                if (record === futureRecord) {
                                    // Refocus first cell of same record
                                    toFocus = this.findNextFocusableOnRow(row);
                                    toFocus.focus();
                                } else {
                                    futureRecord.switchMode("edit");
                                }
                            } else {
                                return false;
                            }
                        } else {
                            const futureRecord = list.records[index + 1];
                            futureRecord.switchMode("edit");
                        }
                    }

                    // if (list.isGrouped || cycleOnTab || index !== list.records.length - 1) {
                    //     const futureRecord = list.records[index + 1] || list.records[0];
                    //     if (record === futureRecord) {
                    //         // Refocus first cell of same record
                    //         toFocus = this.findNextFocusableOnRow(row);
                    //         toFocus.focus();
                    //     } else {
                    //         futureRecord.switchMode("edit");
                    //     }
                    // } else if (
                    //     !cycleOnTab &&
                    //     activeActions &&
                    //     (activeActions.canLink || activeActions.canCreate)
                    // ) {
                    //     if (record.isNew && !record.isDirty) {
                    //         list.unselectRecord(true);
                    //         return false;
                    //     }
                    //     // add a line
                    //     if (record.checkValidity()) {
                    //         const { context } = this.creates[0];
                    //         this.props.onAdd(context);
                    //     }
                    // } else {
                    //     return false;
                    // }
                    // }
                }
                break;
            case "shift+tab": {
                toFocus = this.findPreviousFocusableOnRow(row, cell);
                if (toFocus) {
                    toFocus.focus();
                    this.tableRef.el.querySelector("tbody").classList.add("o_keyboard_navigation");
                } else {
                    const applyMultiEditBehavior = record.selected && list.model.multiEdit;
                    if (applyMultiEditBehavior) {
                        throw new Error("To implement");
                    } else {
                        const index = list.records.indexOf(record);
                        if (index === 0) {
                            throw new Error("To implement");
                        } else {
                            const futureRecord = list.records[index - 1];
                            const column = this.state.columns[this.state.columns.length - 1];
                            this.cellToFocus = { column, record: futureRecord };
                            futureRecord.switchMode("edit");
                        }
                    }
                }
                break;
            }
            case "enter":
                // use this.props.list.model.multiEdit somewhere?

                if (!editable && list.selection && list.selection.length === 1) {
                    list.unselectRecord();
                    break;
                }

                if (editable) {
                    const index = list.records.indexOf(record);
                    const futureRecord = list.records[index + 1];
                    if (futureRecord) {
                        futureRecord.switchMode("edit");
                    } else if (record.checkValidity()) {
                        this.props.onAdd();
                    }
                }

                if (list.selection && list.selection.length > 1) {
                    // Multiple edition
                    const index = list.selection.indexOf(record);
                    const futureRecord = list.selection[index + 1] || list.selection[0];
                    futureRecord.switchMode("edit");
                }
                break;
            case "escape": {
                record.discard();
                list.unselectRecord(true);
                const firstAddButton = this.tableRef.el.querySelector(
                    ".o_field_x2many_list_row_add a"
                );
                if (firstAddButton) {
                    firstAddButton.focus();
                }
                break;
            }
            default:
                return false;
        }
        return true;
    }

    /**
     * @param {string} hotkey
     * @param {HTMLTableCellElement} cell
     * @param { import('@web/views/relational_model').Group
     *  | import('@web/views/relational_model').Record
     *  | import('@web/views/basic_relational_model').Record
     * } dataPoint
     * @returns {boolean} true if some behavior has been taken
     */
    onCellKeydownReadOnlyMode(hotkey, cell, dataPoint) {
        const isInGroupRow = dataPoint instanceof Group;
        let futureCell;
        switch (hotkey) {
            case "arrowup": {
                futureCell = this.findFutureCell(cell, isInGroupRow, "up");

                if (!futureCell) {
                    // todo? maybe cycle through row instead of focusing the search
                    this.env.searchModel.trigger("focus-search");
                    this.tableRef.el
                        .querySelector("tbody")
                        .classList.remove("o_keyboard_navigation");
                }
                break;
            }
            case "arrowdown":
                futureCell = this.findFutureCell(cell, isInGroupRow, "down");
                break;
            case "arrowleft":
                if (isInGroupRow && !dataPoint.isFolded) {
                    this.toggleGroup(dataPoint);
                } else if (cell.classList.contains("o_field_x2many_list_row_add")) {
                    // to refactor
                    const a = document.activeElement;
                    const futureA = a.previousElementSibling;
                    if (futureA) {
                        futureA.focus();
                    }
                } else {
                    futureCell = this.findFutureCell(cell, isInGroupRow, "left");
                }
                break;
            case "arrowright": {
                if (isInGroupRow && dataPoint.isFolded) {
                    this.toggleGroup(dataPoint);
                } else if (cell.classList.contains("o_field_x2many_list_row_add")) {
                    // to refactor
                    const a = document.activeElement;
                    const futureA = a.nextElementSibling;
                    if (futureA) {
                        futureA.focus();
                    }
                } else {
                    futureCell = this.findFutureCell(cell, isInGroupRow, "right");
                }
                break;
            }
            case "enter": {
                const isRemoveTd = cell.classList.contains("o_list_record_remove");
                if (isRemoveTd) {
                    this.onDeleteRecord(dataPoint);
                    break;
                }

                if (isInGroupRow) {
                    this.toggleGroup(dataPoint);
                    break;
                }

                if (!this.props.archInfo.noOpen && dataPoint) {
                    this.props.openRecord(dataPoint);
                    break;
                }
                return false;
            }
            default:
                // Return with no effect (no stop or prevent default...)
                return false;
        }

        if (futureCell) {
            const toFocus = getElementToFocus(futureCell);
            toFocus.focus();
            this.tableRef.el.querySelector("tbody").classList.add("o_keyboard_navigation");
        }

        return true;
    }

    async onCreateAction(context) {
        // TO DISCUSS: is it a use case for owl `batched()` ?
        if (this.createProm) {
            return;
        }
        this.props.onAdd(context);
        this.createProm = Promise.resolve();
        await this.createProm;
        this.createProm = null;
    }

    /**
     * @param {FocusEvent & {
     *  target: HTMLElement,
     *  relatedTarget: HTMLElement | null
     * }} ev
     */
    onFocusIn(ev) {
        const { relatedTarget, target } = ev;
        const fromOutside = !this.rootRef.el.contains(relatedTarget);
        if (!fromOutside) {
            return;
        }

        const isX2MRowAdder =
            target.tagName === "A" &&
            target.parentElement.classList.contains("o_field_x2many_list_row_add");
        const withinSameUIActiveElement =
            this.uiService.getActiveElementOf(relatedTarget) === this.activeElement;
        if (withinSameUIActiveElement && isX2MRowAdder) {
            const { context } = this.creates[0];
            this.onCreateAction(context);
        }
    }

    saveOptionalActiveFields() {
        browser.localStorage.setItem(
            this.keyOptionalFields,
            Object.keys(this.optionalActiveFields).filter(
                (fieldName) => this.optionalActiveFields[fieldName]
            )
        );
    }

    get showNoContentHelper() {
        const { model } = this.props.list;
        return this.props.noContentHelp && (model.useSampleModel || !model.hasData());
    }

    showGroupPager(group) {
        return !group.isFolded && group.list.limit < group.list.count;
    }

    get showTable() {
        const { model } = this.props.list;
        return model.hasData() || !this.props.noContentHelp;
    }

    toggleGroup(group) {
        group.toggle();
    }

    toggleSelection() {
        const list = this.props.list;
        if (list.selection.length === list.records.length) {
            list.records.forEach((record) => {
                record.toggleSelection(false);
                list.selectDomain(false);
            });
        } else {
            list.records.forEach((record) => {
                record.toggleSelection(true);
            });
        }
    }

    toggleRecordSelection(record) {
        record.toggleSelection();
        this.props.list.selectDomain(false);
    }

    async toggleOptionalField(fieldName) {
        await this.props.list.unselectRecord(true);
        this.optionalActiveFields[fieldName] = !this.optionalActiveFields[fieldName];
        this.state.columns = this.allColumns.filter(
            (col) => !col.optional || this.optionalActiveFields[col.name]
        );
        this.saveOptionalActiveFields(
            this.allColumns.filter((col) => this.optionalActiveFields[col.name] && col.optional)
        );
    }

    onGlobalClick(ev) {
        if (!this.props.list.editedRecord) {
            return; // there's no row in edition
        }

        // WOWL: see if a test exists?
        const tbody = this.tableRef.el.querySelector("tbody");
        tbody.classList.remove("o_keyboard_navigation");

        if (this.tableRef.el.contains(ev.target)) {
            return; // ignore clicks inside the table, they are handled directly by the renderer
        }
        if (this.activeElement !== this.uiService.activeElement) {
            return;
        }
        // Legacy DatePicker
        if (ev.target.closest(".daterangepicker")) {
            return;
        }
        this.props.list.unselectRecord(true);
    }

    calculateColumnWidth(column) {
        if (column.options && column.attrs.width) {
            return { type: "absolute", value: column.attrs.width };
        }

        if (column.type !== "field") {
            return { type: "relative", value: 1 };
        }

        const type = column.widget || this.props.list.fields[column.name].type;
        if (type in FIXED_FIELD_COLUMN_WIDTHS) {
            return { type: "absolute", value: FIXED_FIELD_COLUMN_WIDTHS[type] };
        }

        return { type: "relative", value: 1 };
    }

    get isDebugMode() {
        return Boolean(odoo.debug);
    }

    makeTooltip(column) {
        return getTooltipInfo({
            viewMode: "list",
            resModel: this.props.list.resModel,
            field: this.props.list.fields[column.name],
            fieldInfo: this.props.list.activeFields[column.name],
        });
    }

    /**
     * Handles the resize feature on the column headers
     *
     * @private
     * @param {MouseEvent} ev
     */
    onStartResize(ev) {
        const table = this.tableRef.el;
        const th = ev.target.closest("th");
        table.style.width = `${table.offsetWidth}px`;
        const thPosition = [...th.parentNode.children].indexOf(th);
        const resizingColumnElements = [...table.getElementsByTagName("tr")]
            .filter((tr) => tr.children.length === th.parentNode.children.length)
            .map((tr) => tr.children[thPosition]);
        const optionalDropdown = table.querySelector("o_optional_columns");
        const initialX = ev.clientX;
        const initialWidth = th.offsetWidth;
        const initialTableWidth = table.offsetWidth;
        const initialDropdownX = optionalDropdown ? optionalDropdown.offsetLeft : null;
        const resizeStoppingEvents = ["keydown", "mousedown", "mouseup"];

        // fix the width so that if the resize overflows, it doesn't affect the layout of the parent
        if (!this.rootRef.el.style.width) {
            this.rootRef.el.style.width = `${this.rootRef.el.offsetWidth}px`;
        }

        // Apply classes to table and selected column
        table.classList.add("o_resizing");
        for (const el of resizingColumnElements) {
            el.classList.add("o_column_resizing");
        }
        // Mousemove event : resize header
        const resizeHeader = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const delta = ev.clientX - initialX;
            const newWidth = Math.max(10, initialWidth + delta);
            const tableDelta = newWidth - initialWidth;
            th.style.width = `${newWidth}px`;
            th.style.maxWidth = `${newWidth}px`;
            table.style.width = `${initialTableWidth + tableDelta}px`;
            if (optionalDropdown) {
                optionalDropdown.style.left = `${initialDropdownX + tableDelta}px`;
            }
        };
        window.addEventListener("mousemove", resizeHeader);

        // Mouse or keyboard events : stop resize
        const stopResize = (ev) => {
            // Ignores the 'left mouse button down' event as it used to start resizing
            if (ev.type === "mousedown" && ev.which === 1) {
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();

            table.classList.remove("o_resizing");
            for (const el of resizingColumnElements) {
                el.classList.remove("o_column_resizing");
            }

            window.removeEventListener("mousemove", resizeHeader);
            for (const eventType of resizeStoppingEvents) {
                window.removeEventListener(eventType, stopResize);
            }

            // we remove the focus to make sure that the there is no focus inside
            // the tr.  If that is the case, there is some css to darken the whole
            // thead, and it looks quite weird with the small css hover effect.
            document.activeElement.blur();
        };
        // We have to listen to several events to properly stop the resizing function. Those are:
        // - mousedown (e.g. pressing right click)
        // - mouseup : logical flow of the resizing feature (drag & drop)
        // - keydown : (e.g. pressing 'Alt' + 'Tab' or 'Windows' key)
        for (const eventType of resizeStoppingEvents) {
            window.addEventListener(eventType, stopResize);
        }
    }
}

ListRenderer.template = "web.ListRenderer";
ListRenderer.components = { CheckBoxDropdownItem, Field, ViewButton, CheckBox, Dropdown, Pager };
ListRenderer.props = [
    "activeActions?",
    "list",
    "archInfo",
    "openRecord",
    "onAdd?",
    "cycleOnTab?",
    "hasSelectors?",
    "editable?",
    "noContentHelp?",
    "nestedKeyOptionalFieldsData?",
];
ListRenderer.defaultProps = { hasSelectors: false, cycleOnTab: true };
