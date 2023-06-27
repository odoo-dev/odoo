/* @odoo-module */

import { Domain } from "@web/core/domain";
import { DataPoint } from "./datapoint";

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
        this.range = data.range;
        this._rawValue = data[this.groupByField.name];
        /** @type {number} */
        this.count = data.count;
        this.value = data.value;
        this.displayName = data.displayName;
        this.aggregates = data.aggregates;
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

    async addExistingRecord(resId, atFirstPosition = false) {
        const record = await this.list.addExistingRecord(resId, atFirstPosition);
        this.count++;
        return record;
    }

    async addNewRecord(_unused, atFirstPosition = false) {
        const canProceed = await this.model.root.leaveEditMode({ discard: true });
        if (canProceed) {
            const record = await this.list.addNewRecord(atFirstPosition);
            if (record) {
                this.count++;
            }
        }
    }

    async applyFilter(filter) {
        if (filter) {
            await this.list.load({
                domain: Domain.and([this.config.initialDomain, filter]).toList(),
            });
        } else {
            await this.list.load({ domain: this.config.initialDomain });
        }
        this.model._updateConfig(this.config, { extraDomain: filter }, { noReload: true });
    }

    deleteRecords(records) {
        return this.model.mutex.exec(() => this._deleteRecords(records));
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

    _addRecord(record, index) {
        this.list._addRecord(record, index);
        this.count++;
    }

    async _deleteRecords(records) {
        await this.list._deleteRecords(records);
        this.count -= records.length;
    }

    async _removeRecords(recordIds) {
        const idsToRemove = recordIds.filter((id) => this.list.records.some((r) => r.id === id));
        await this.list._removeRecords(idsToRemove);
        this.count -= idsToRemove.length;
    }
}
