/* @odoo-module */

import { x2ManyCommands } from "@web/core/orm_service";
import { intersection } from "@web/core/utils/arrays";
import { pick } from "@web/core/utils/objects";
import { getId } from "./utils";
import { DataPoint } from "./datapoint";

import { markRaw } from "@odoo/owl";

function compareFieldValues(v1, v2, fieldType) {
    if (fieldType === "many2one") {
        v1 = v1 ? v1[1] : false;
        v2 = v2 ? v2[1] : false;
    }
    return v1 < v2;
}
function compareRecords(r1, r2, orderBy, fields) {
    const { name, asc } = orderBy[0];
    const v1 = asc ? r1.data[name] : r2.data[name];
    const v2 = asc ? r2.data[name] : r1.data[name];
    if (compareFieldValues(v1, v2, fields[name].type)) {
        return -1;
    }
    if (compareFieldValues(v2, v1, fields[name].type)) {
        return 1;
    }
    if (orderBy.length > 1) {
        return compareRecords(r1, r2, orderBy.slice(1));
    }
    return 0;
}

export class StaticList extends DataPoint {
    static type = "StaticList";

    setup(config, data, options = {}) {
        this._parent = options.parent;
        this._onChange = options.onChange;
        this._cache = markRaw({});
        this.records = data
            .slice(this.offset, this.limit)
            .map((r) => this._createRecordDatapoint(r));
        this._commands = [];
        this._currentIds = [...this.resIds];
        this._needsReordering = false;
        this.count = this.resIds.length;
        this.context = {}; // FIXME: should receive context (remove this when it does, see datapoint.js)
    }

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    get currentIds() {
        return this.records.map((r) => r.resId);
    }

    get editedRecord() {
        return this.records.find((record) => record.isInEdition);
    }

    get evalContext() {
        return {
            parent: this._parent.evalContext,
        };
    }

    get limit() {
        return this.config.limit;
    }

    get offset() {
        return this.config.offset;
    }

    get resIds() {
        return this.config.resIds;
    }

    get orderBy() {
        return this.config.orderBy;
    }

    // -------------------------------------------------------------------------
    // Public
    // -------------------------------------------------------------------------

    async addNew(params) {
        const values = await this.model._loadNewRecord({
            resModel: this.resModel,
            activeFields: this.activeFields,
            context: Object.assign({}, this.context, params.context),
        });
        const virtualId = getId("virtual");
        const record = this._createRecordDatapoint(values, { mode: "edit", virtualId });
        if (params.position === "bottom") {
            this.records.push(record);
            this._currentIds.splice(this.offset + this.limit, 0, virtualId);
        } else {
            this.records.unshift(record);
            this._currentIds.splice(this.offset, 0, virtualId);
        }
        this._commands.push([x2ManyCommands.CREATE, virtualId, record]);
        this._needsReordering = true;
        this._onChange();
    }

    canResequence() {
        return false;
    }

    load({ limit, offset, orderBy }) {
        limit = limit !== undefined ? limit : this.limit;
        offset = offset !== undefined ? offset : this.offset;
        orderBy = orderBy !== undefined ? orderBy : this.orderBy;
        return this.model.mutex.exec(() => this._load({ limit, offset, orderBy }));
    }

    sortBy(fieldName) {
        return this.model.mutex.exec(() => this._sortBy(fieldName));
    }

    leaveEditMode() {
        if (this.editedRecord) {
            this.model._updateConfig(
                this.editedRecord.config,
                { mode: "readonly" },
                { noReload: true }
            );
        }
        return true;
    }

    enterEditMode(record) {
        this.leaveEditMode();
        this.model._updateConfig(record.config, { mode: "edit" }, { noReload: true });
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    _applyCommands(commands) {
        for (const command of commands) {
            switch (command[0]) {
                case x2ManyCommands.CREATE: {
                    const virtualId = getId("virtual");
                    const record = this._createRecordDatapoint(command[2], { virtualId });
                    this.records.push(record);
                    this._commands.push([x2ManyCommands.CREATE, virtualId, record]);
                    this._currentIds.splice(this.offset + this.limit, 0, virtualId);
                    break;
                }
                case x2ManyCommands.UPDATE: {
                    const existingCommand = this._commands.find((c) => c[1] === command[1]);
                    let record;
                    if (existingCommand) {
                        record = existingCommand[2];
                    } else {
                        record = this.records.find((record) => record.resId === command[1]);
                        if (!record) {
                            throw new Error(`Can't find record ${command[1]}`);
                        }
                        this._commands.push([x2ManyCommands.UPDATE, command[1], record]);
                    }
                    record._applyChanges(record._parseServerValues(command[2], record.data));
                    break;
                }
                case x2ManyCommands.DELETE: {
                    // TODO
                    break;
                }
                case x2ManyCommands.FORGET: {
                    // TODO
                    break;
                }
                case x2ManyCommands.LINK_TO: {
                    // TODO (needs unity + onchange2)
                    // const record = this._createRecordDatapoint(command[2]);
                    // this.records.push(record);
                    // this._commands.push([command[0], command[1]]);
                    break;
                }
                case x2ManyCommands.DELETE_ALL: {
                    // TODO
                    this.records = [];
                    this._currentIds = [];
                    break;
                }
                case x2ManyCommands.REPLACE_WITH: {
                    // TODO (needs unity + onchange2)
                    break;
                }
            }
        }
    }

    _createRecordDatapoint(data, params = {}) {
        const resId = data.id || false;
        if (!resId && !params.virtualId) {
            throw new Error("You must provide a virtualId if the record has no id");
        }
        const config = {
            context: this.context,
            activeFields: params.activeFields || this.activeFields,
            resModel: this.resModel,
            fields: this.fields,
            resId,
            resIds: resId ? [resId] : [],
            mode: params.mode || "readonly",
            isMonoRecord: true,
        };
        const options = {
            parentRecord: this._parent,
            onChange: this._onChange,
        };
        const record = new this.model.constructor.Record(this.model, config, data, options);
        this._cache[resId || params.virtualId] = record;
        return record;
    }

    _getCommands() {
        // TODO: encapsulate commands in a class?
        return this._commands.map((c) => {
            if (c[2]) {
                return [c[0], c[1], c[2]._getChanges()];
            }
            return [c[0], c[1]];
        });
    }

    async _load({ limit, offset, orderBy }) {
        const records = await this.model._updateConfig(this.config, { limit, offset, orderBy });
        // FIXME: might need to keep references to the records of previous page (for changes)
        this.records = records.map((r) => this._createRecordDatapoint(r));
    }

    async _sortBy(fieldName) {
        let orderBy = [...this.config.orderBy];
        if (orderBy.length && orderBy[0].name === fieldName) {
            if (!this._needsReordering) {
                orderBy[0] = { name: orderBy[0].name, asc: !orderBy[0].asc };
            }
        } else {
            orderBy = orderBy.filter((o) => o.name !== fieldName);
            orderBy.unshift({
                name: fieldName,
                asc: true,
            });
        }
        const fieldNames = orderBy.map((o) => o.name);
        const resIds = this._currentIds.filter((id) => {
            if (typeof id === "string") {
                // this is a virtual id, we don't want to read it
                return false;
            }
            const record = this._cache[id];
            if (!record) {
                // record hasn't been loaded yet
                return true;
            }
            // record has already been loaded -> check if we already read all orderBy fields
            return intersection(record.fieldNames, fieldNames).length !== fieldNames.length;
        });
        if (resIds.length) {
            const activeFields = pick(this.activeFields, fieldNames);
            const config = { ...this.config, resIds, activeFields };
            const records = await this.model._loadRecords(config);
            for (const record of records) {
                // FIXME: if already in cache, we'll lose potential pending changes
                // maybe keep existing record, and write inside _values
                this._createRecordDatapoint(record, { activeFields });
            }
        }
        const allRecords = this._currentIds.map((id) => this._cache[id]);
        const sortedRecords = allRecords.sort((r1, r2) => {
            return compareRecords(r1, r2, orderBy, this.fields) || (orderBy[0].asc ? -1 : 1);
        });
        const currentPageRecords = sortedRecords.slice(this.offset, this.offset + this.limit);
        //TODO: read records that haven't been fully read yet
        this.model._updateConfig(this.config, { orderBy }, { noReload: true });
        this.records = currentPageRecords;
        this._needsReordering = false;
    }
}
