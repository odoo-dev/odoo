/* @odoo-module */

import { x2ManyCommands } from "@web/core/orm_service";
import { intersection } from "@web/core/utils/arrays";
import { pick } from "@web/core/utils/objects";
import { DataPoint } from "./datapoint";
import { getId } from "./utils";

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
        this._commands = [];
        this._unknownRecordCommands = {}; // tracks update commands on records we haven't fetched yet
        this._currentIds = [...this.resIds];
        this._needsReordering = false;
        this.records = data
            .slice(this.offset, this.limit)
            .map((r) => this._createRecordDatapoint(r));
        this.count = this.resIds.length;
    }

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    get currentIds() {
        return this.records.map((r) => r.resId).filter((id) => this._currentIds.includes(id));
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
            fields: this.fields,
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
        this._commands.push([x2ManyCommands.CREATE, virtualId]);
        this._needsReordering = true;
        this._onChange();
    }

    delete(recordId) {
        this._applyCommands([[x2ManyCommands.DELETE, recordId]]);
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

    async replaceWith(ids) {
        const resIds = ids.filter((id) => !this._cache[id]);
        if (resIds.length) {
            const records = await this.model._loadRecords({
                ...this.config,
                resIds: ids.filter((id) => !this._cache[id]),
                context: this.context,
            });
            for (const record of records) {
                this._createRecordDatapoint(record);
            }
        }
        this.records = ids.map((id) => this._cache[id]);
        this._commands = [x2ManyCommands.replaceWith(ids)];
        this._currentIds = [...ids];
        this._onChange();
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    _applyCommands(commands) {
        const { CREATE, UPDATE, DELETE, FORGET, LINK_TO } = x2ManyCommands;
        for (const command of commands) {
            switch (command[0]) {
                case CREATE: {
                    const virtualId = getId("virtual");
                    const record = this._createRecordDatapoint(command[2], { virtualId });
                    this.records.push(record);
                    this._commands.push([CREATE, virtualId]);
                    this._currentIds.splice(this.offset + this.limit, 0, virtualId);
                    this.count++;
                    break;
                }
                case UPDATE: {
                    let record = this._cache[command[1]];
                    if (!record) {
                        record = this._createRecordDatapoint({ id: command[1] });
                        // the record isn't in the cache, it means it is on a page we haven't loaded
                        // so we say the record is "unknown", and store all update commands we
                        // receive about it in a separated structure, s.t. we can easily apply them
                        // later on after loading the record, if we ever load it.
                        this._unknownRecordCommands[command[1]] = [];
                    }
                    if (command[1] in this._unknownRecordCommands) {
                        // the record is currently unknown, store the command in case we need it later
                        this._unknownRecordCommands[command[1]].push(command);
                    }
                    const existingCommand = this._commands.find((c) => {
                        return (c[0] === CREATE || c[0] === UPDATE) && c[1] === command[1];
                    });
                    if (!existingCommand) {
                        this._commands.push([UPDATE, command[1]]);
                    }
                    record._applyChanges(record._parseServerValues(command[2], record.data));
                    break;
                }
                case DELETE: {
                    if (!this._commands.find((c) => c[0] === CREATE && c[1] === command[1])) {
                        this._commands.push([DELETE, command[1]]);
                    }
                    this._commands = this._commands.filter((c) => {
                        return !(c[0] === CREATE || c[0] === UPDATE) || c[1] !== command[1];
                    });
                    const record = this._cache[command[1]];
                    delete this._cache[command[1]];
                    this.records.splice(
                        this.records.findIndex((r) => r === record),
                        1
                    );
                    if (record.resId) {
                        const index = this._currentIds.findIndex((id) => id === record.resId);
                        this._currentIds.splice(index, 1);
                    }
                    this.count--;
                    break;
                }
                case FORGET: {
                    const index = this._commands.findIndex(
                        (c) => c[0] === LINK_TO && c[1] === command[1]
                    );
                    if (index === -1) {
                        this._commands.push([FORGET, command[1]]);
                    } else {
                        this._commands.splice(index, 1);
                    }
                    const record = this._cache[command[1]];
                    delete this._cache[command[1]];
                    this.records.splice(
                        this.records.findIndex((r) => r === record),
                        1
                    );
                    if (record.resId) {
                        const index = this._currentIds.findIndex((id) => id === record.resId);
                        this._currentIds.splice(index, 1);
                    }
                    this.count--;
                    break;
                }
                case LINK_TO: {
                    const record = this._createRecordDatapoint(command[2]);
                    this.records.push(record);
                    this._commands.push([command[0], command[1]]);
                    this.count++;
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
        const id = resId || params.virtualId;
        if (this._cache[id] && !(id in this._unknownRecordCommands)) {
            // we should never come here
            throw new Error("Record already exists in cache");
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
        const { CREATE, UPDATE } = x2ManyCommands;
        const options = {
            parentRecord: this._parent,
            onChange: () => {
                const hasCommand = this._commands.some(
                    (c) => (c[0] === CREATE || c[0] === UPDATE) && c[1] === id
                );
                if (!hasCommand) {
                    this._commands.push([UPDATE, id]);
                }
                this._onChange();
            },
        };
        const record = new this.model.constructor.Record(this.model, config, data, options);
        this._cache[id] = record;
        const commands = this._unknownRecordCommands[id];
        if (commands) {
            delete this._unknownRecordCommands[id];
            this._applyCommands(commands);
        }
        return record;
    }

    _getCommands({ withReadonly } = {}) {
        return this._commands.map((c) => {
            if (c[0] === x2ManyCommands.CREATE || c[0] === x2ManyCommands.UPDATE) {
                const record = this._cache[c[1]];
                return [c[0], c[1], record._getChanges(record._changes, { withReadonly })];
            }
            return c;
        });
    }

    async _load({ limit, offset, orderBy }) {
        const records = await this.model._updateConfig(this.config, { limit, offset, orderBy });
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
