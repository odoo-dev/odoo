/* @odoo-module */

import { DataPoint } from "./datapoint";

const AGGREGATABLE_FIELD_TYPES = ["float", "integer", "monetary"]; // types that can be aggregated in grouped views

/**
 * @typedef Params
 * @property {string[]} groupBy
 */

export class Group extends DataPoint {
    static type = "Group";
    /**
     * @param {import("./relational_model").Config} config
     */
    setup(config, data) {
        super.setup(...arguments);
        this.groupByField = this.fields[config.groupByFieldName];
        this.progressBars = []; // FIXME: remove from model?
        this.range = data.range;
        this._rawValue = data[this.groupByField.name];
        /** @type {number} */
        this.count = data.count;
        this.value = this._getValueFromGroupData(data, this.groupByField);
        this.displayName = this._getDisplayNameFromGroupData(data, this.groupByField);
        this.aggregates = this._getAggregatesFromGroupData(data);
        let List;
        if (config.list.groupBy.length) {
            List = this.model.constructor.DynamicGroupList;
        } else {
            List = this.model.constructor.DynamicRecordList;
        }
        /** @type {import("./dynamic_group_list").DynamicGroupList | import("./dynamic_record_list").DynamicRecordList} */
        this.list = new List(this.model, config.list, data);
        if (config.record) {
            this.record = new this.model.constructor.Record(this.model, config.record, data.values);
        }
    }

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    get hasData() {
        return this.list.hasData;
    }
    get isFolded() {
        return this.config.isFolded;
    }
    get records() {
        return this.list.records;
    }

    // -------------------------------------------------------------------------
    // Public
    // -------------------------------------------------------------------------

    empty() {
        this.list.empty();
    }

    addRecord(record, index) {
        this.list._addRecord(record, index);
        this.count++;
    }

    addExistingRecord(resId, atFirstPosition = false) {
        this.count++;
        return this.list.addExistingRecord(resId, atFirstPosition);
    }

    async createRecord(_unused, atFirstPosition = false) {
        const canProceed = await this.model.root.leaveEditMode({ discard: true });
        if (canProceed) {
            await this.list.createRecord(atFirstPosition);
            this.count++;
        }
    }

    async deleteRecords(records) {
        await this.list.deleteRecords(records);
        this.count -= records.length;
    }

    getServerValue() {
        const { type } = this.groupByField;

        // TODO: handle other types (selection, date, datetime)
        switch (type) {
            case "many2one":
                return this.value || false;
            case "many2many": {
                return this.value ? [this.value] : false;
            }
            default: {
                return this._rawValue || false;
            }
        }
    }

    async toggle() {
        if (this.config.isFolded) {
            await this.list.load();
        }
        this.model._toggleGroup(this.config);
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    /**
     * @param {Object} groupData
     * @returns {Object}
     */
    _getAggregatesFromGroupData(groupData) {
        const aggregates = {};
        for (const [key, value] of Object.entries(groupData)) {
            if (key in this.fields && AGGREGATABLE_FIELD_TYPES.includes(this.fields[key].type)) {
                aggregates[key] = value;
            }
        }
        return aggregates;
    }

    /**
     * @param {Object} groupData
     * @param {import("./datapoint").Field} field
     * @returns {string | false}
     */
    _getDisplayNameFromGroupData(groupData, field) {
        if (field.type === "selection") {
            return Object.fromEntries(field.selection)[groupData.value];
        }
        if (["many2one", "many2many"].includes(field.type)) {
            return groupData.value ? groupData.value[1] : false;
        }
        return groupData.value;
    }

    /**
     * @param {Object} groupData
     * @param {import("./datapoint").Field} field
     * @returns {any}
     */
    _getValueFromGroupData(groupData, field) {
        if (["date", "datetime"].includes(field.type)) {
            const range = groupData.range;
            if (!range) {
                return false;
            }
            const dateValue = this._parseServerValue(field, range.to);
            return dateValue.minus({
                [field.type === "date" ? "day" : "second"]: 1,
            });
        }
        const value = this._parseServerValue(field, groupData.value);
        if (["many2one", "many2many"].includes(field.type)) {
            return value ? value[0] : false;
        }
        return value;
    }

    async _removeRecords(records) {
        const recordsToRemove = records.filter((record) => this.list.records.includes(record));
        await this.list._removeRecords(records);
        this.count -= recordsToRemove.length;
    }
}
