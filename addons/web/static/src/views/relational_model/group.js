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
        // this.range = data.__range;
        this._rawValue = data[this.groupByField.name];
        // When group_by_no_leaf key is present FIELD_ID_count doesn't exist
        // we have to get the count from `__count` instead
        // see _read_group_raw in models.py
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

    removeRecord(record) {
        this.list._removeRecords([record]);
        this.count--;
    }

    addRecord(record, index) {
        this.list._addRecord(record, index);
        this.count++;
    }

    addExistingRecord(resId, atFirstPosition = false) {
        this.count++;
        return this.list.addExistingRecord(resId, atFirstPosition);
    }

    async createRecord() {
        await this.list.createRecord();
        this.count++;
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
            return Object.fromEntries(field.selection)[groupData[field.name]];
        }
        if (["many2one", "many2many"].includes(field.type)) {
            return groupData[field.name] ? groupData[field.name][1] : false;
        }
        return groupData[field.name];
    }

    /**
     * @param {Object} groupData
     * @param {import("./datapoint").Field} field
     * @returns {any}
     */
    _getValueFromGroupData(groupData, field) {
        if (["date", "datetime"].includes(field.type)) {
            const range = groupData.__range[field.name];
            if (!range) {
                return false;
            }
            const dateValue = this._parseServerValue(field, range.to);
            return dateValue.minus({
                [field.type === "date" ? "day" : "second"]: 1,
            });
        }
        const value = this._parseServerValue(field, groupData[field.name]);
        if (["many2one", "many2many"].includes(field.type)) {
            return value ? value[0] : false;
        }
        return value;
    }
}
