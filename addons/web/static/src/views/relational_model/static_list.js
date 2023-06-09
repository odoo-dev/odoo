/* @odoo-module */

import { x2ManyCommands } from "@web/core/orm_service";
import { intersection } from "@web/core/utils/arrays";
import { pick } from "@web/core/utils/objects";
import { DataPoint } from "./datapoint";
import { patchActiveFields, getId, fromUnityToServerValues } from "./utils";

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
        this._savePoint = markRaw({});
        this._unknownRecordCommands = {}; // tracks update commands on records we haven't fetched yet
        this._currentIds = [...this.resIds];
        this._needsReordering = false;
        this._tmpIncreaseLimit = 0;
        this.records = data
            .slice(this.offset, this.limit)
            .map((r) => this._createRecordDatapoint(r));
        this.count = this.resIds.length;
    }

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    get currentIds() {
        return this._currentIds;
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

    /**
     * Adds a new record to an x2many relation. If params.record is given, adds
     * given record (use case: after saving the form dialog in a, e.g., non
     * editable x2many list). Otherwise, do an onchange to get the initial
     * values and create a new Record (e.g. after clicking on Add a line in an
     * editable x2many list).
     *
     * @param {Object} params
     * @param {"top"|"bottom"} [params.position="bottom"]
     * @param {Object} [params.activeFields=this.activeFields]
     * @param {boolean} [params.withoutParent=false]
     */
    addNew(params) {
        return this.model.mutex.exec(async () => {
            const record = await this._createNewRecordDatapoint({
                activeFields: params.activeFields,
                context: params.context,
                withoutParent: params.withoutParent,
            });
            this._addRecord(record, { position: params.position });
            this._onChange({ withoutOnchange: !record._checkValidity({ silent: true }) });
            return record;
        });
    }

    delete(record) {
        this._applyCommands([[x2ManyCommands.DELETE, record.resId || record.virtualId]]);
        this._onChange();
    }

    forget(record) {
        this._applyCommands([[x2ManyCommands.FORGET, record.resId]]);
        this._onChange();
    }

    canResequence() {
        return false;
    }

    load({ limit, offset, orderBy }) {
        return this.model.mutex.exec(async () => {
            if (this.editedRecord && !(await this.editedRecord.checkValidity())) {
                return;
            }
            limit = limit !== undefined ? limit : this.limit;
            offset = offset !== undefined ? offset : this.offset;
            orderBy = orderBy !== undefined ? orderBy : this.orderBy;
            return this._load({ limit, offset, orderBy });
        });
    }

    sortBy(fieldName) {
        return this.model.mutex.exec(() => this._sortBy(fieldName));
    }

    leaveEditMode({ discard, canAbandon } = {}) {
        return this.model.mutex.exec(async () => {
            if (this.editedRecord) {
                const isValid = await this.editedRecord.checkValidity();
                if (canAbandon !== false) {
                    this._abandonRecords([this.editedRecord], { force: discard || !isValid });
                }
                // if we still have an editedRecord, it means it hasn't been abandonned
                if (this.editedRecord && (isValid || this.editedRecord._canNeverBeAbandoned)) {
                    this.model._updateConfig(
                        this.editedRecord.config,
                        { mode: "readonly" },
                        { noReload: true }
                    );
                }
            }
            return !this.editedRecord;
        });
    }

    async enterEditMode(record) {
        const canProceed = await this.leaveEditMode();
        if (canProceed) {
            this.model._updateConfig(record.config, { mode: "edit" }, { noReload: true });
        }
        return canProceed;
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
        this.count = this._currentIds.length;
        this._onChange();
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    _abandonRecords(records, { force } = {}) {
        for (const record of this.records) {
            // FIXME: should canBeAbandoned check validity?
            if (record.canBeAbandoned && (force || !record._checkValidity())) {
                const virtualId = record.virtualId;
                const index = this._currentIds.findIndex((id) => id === virtualId);
                this._currentIds.splice(index, 1);
                this.records.splice(
                    this.records.findIndex((r) => r === record),
                    1
                );
                this._commands = this._commands.filter((c) => c[1] !== virtualId);
                this.count--;
                if (this._tmpIncreaseLimit > 0) {
                    this.model._updateConfig(
                        this.config,
                        { limit: this.limit - 1 },
                        { noReload: true }
                    );
                    this._tmpIncreaseLimit--;
                }
            }
        }
    }

    _addRecord(record, { position } = {}) {
        const command = [x2ManyCommands.CREATE, record.virtualId];
        if (position === "top") {
            this.records.unshift(record);
            if (this.records.length > this.limit) {
                this.records.pop();
            }
            this._currentIds.splice(this.offset, 0, record.virtualId);
            this._commands.unshift(command);
        } else {
            this.records.push(record);
            this._currentIds.splice(this.offset + this.limit, 0, record.virtualId);
            if (this.records.length > this.limit) {
                this._tmpIncreaseLimit++;
                const nextLimit = this.limit + 1;
                this.model._updateConfig(this.config, { limit: nextLimit }, { noReload: true });
            }
            this._commands.push(command);
        }
        this.count++;
        this._needsReordering = true;
        delete record._notAddedYet;
    }

    _addSavePoint() {
        for (const id in this._cache) {
            this._cache[id]._addSavePoint();
        }
        this._savePoint._commands = [...this._commands];
        this._savePoint._currentIds = [...this._currentIds];
        this._savePoint.count = this.count;
    }

    _applyCommands(commands) {
        const isOnLastPage = this.limit + this.offset >= this.count;
        const { CREATE, UPDATE, DELETE, FORGET, LINK_TO } = x2ManyCommands;
        for (const command of commands) {
            switch (command[0]) {
                case CREATE: {
                    const virtualId = getId("virtual");
                    const record = this._createRecordDatapoint(command[2], {
                        virtualId,
                        canNeverBeAbandoned: true,
                    });
                    this.records.push(record);
                    this._commands.push([CREATE, virtualId]);
                    this._currentIds.splice(this.offset + this.limit, 0, virtualId);
                    this.count++;
                    break;
                }
                case UPDATE: {
                    const existingCommand = this._commands.find((c) => {
                        return (c[0] === CREATE || c[0] === UPDATE) && c[1] === command[1];
                    });
                    if (!existingCommand) {
                        this._commands.push([UPDATE, command[1]]);
                    }
                    const record = this._cache[command[1]];
                    if (!record) {
                        // the record isn't in the cache, it means it is on a page we haven't loaded
                        // so we say the record is "unknown", and store all update commands we
                        // receive about it in a separated structure, s.t. we can easily apply them
                        // later on after loading the record, if we ever load it.
                        if (!(command[1] in this._unknownRecordCommands)) {
                            this._unknownRecordCommands[command[1]] = [];
                        }
                        this._unknownRecordCommands[command[1]].push(command);
                    } else if (command[1] in this._unknownRecordCommands) {
                        // this case is more tricky: the record is in the cache, but it isn't loaded
                        // yet, as we are currently loading it (see below, where we load missing
                        // records for the current page)
                        this._unknownRecordCommands[command[1]].push(command);
                    } else {
                        record._applyChanges(record._parseServerValues(command[2], record.data));
                    }
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
                    this.records.splice(
                        this.records.findIndex((r) => r.id === record.id),
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
                    this.records.splice(
                        this.records.findIndex((r) => r.id === record.id),
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
                    if (!this.limit || this.records.length < this.limit) {
                        this.records.push(record);
                    }
                    this._currentIds.push(record.resId);
                    this._commands.push([command[0], command[1]]);
                    this.count++;
                    break;
                }
            }
        }
        // if we aren't on the last page, and *n* records of the current page have been removed
        // removed, the first *n* records of the next page become the last *n* ones of the current
        // page, so we need to add (and maybe load) them.
        const nbMissingRecords = this.limit - this.records.length;
        if (!isOnLastPage && nbMissingRecords > 0) {
            const lastRecordIndex = this.limit + this.offset;
            const firstRecordIndex = lastRecordIndex - nbMissingRecords;
            const nextRecordIds = this._currentIds.slice(firstRecordIndex, lastRecordIndex);
            const recordsToLoad = [];
            for (const id of nextRecordIds) {
                if (this._cache[id]) {
                    this.records.push(this._cache[id]);
                } else {
                    // id isn't in the cache, so we know it's not a virtual id
                    const record = this._createRecordDatapoint({ id }, { dontApplyCommands: true });
                    this.records.push(record);
                    recordsToLoad.push(record);
                }
            }
            const resIds = recordsToLoad.map((r) => r.resId);
            this.model._loadRecords({ ...this.config, resIds }).then((recordValues) => {
                for (let i = 0; i < recordsToLoad.length; i++) {
                    const record = recordsToLoad[i];
                    record._applyValues(recordValues[i]);
                    const commands = this._unknownRecordCommands[record.resId];
                    if (commands) {
                        delete this._unknownRecordCommands[record.resId];
                        this._applyCommands(commands);
                    }
                }
            });
        }
    }

    _createRecordDatapoint(data, params = {}) {
        const resId = data.id || false;
        if (!resId && !params.virtualId) {
            throw new Error("You must provide a virtualId if the record has no id");
        }
        const id = resId || params.virtualId;
        const config = {
            context: this.context,
            activeFields: params.activeFields || this.activeFields,
            resModel: this.resModel,
            fields: params.fields || this.fields,
            relationField: this.config.relationField,
            resId,
            resIds: resId ? [resId] : [],
            mode: params.mode || "readonly",
            isMonoRecord: true,
        };
        const { CREATE, UPDATE } = x2ManyCommands;
        const options = {
            parentRecord: this._parent,
            onChange: () => {
                if (record._notAddedYet) {
                    return;
                }
                const hasCommand = this._commands.some(
                    (c) => (c[0] === CREATE || c[0] === UPDATE) && c[1] === id
                );
                if (!hasCommand) {
                    this._commands.push([UPDATE, id]);
                }
                this._onChange({ withoutOnchange: !record._checkValidity({ silent: true }) });
            },
            virtualId: params.virtualId,
            canNeverBeAbandoned: params.canNeverBeAbandoned,
        };
        const record = new this.model.constructor.Record(this.model, config, data, options);
        this._cache[id] = record;
        if (!params.dontApplyCommands) {
            const commands = this._unknownRecordCommands[id];
            if (commands) {
                delete this._unknownRecordCommands[id];
                this._applyCommands(commands);
            }
        }
        return record;
    }

    async _createNewRecordDatapoint(params = {}) {
        const changes = {};
        if (!params.withoutParent) {
            changes[this.config.relationField] = this._parent._getChanges();
        }
        const values = await this.model._loadNewRecord(
            {
                resModel: this.resModel,
                activeFields: params.activeFields || this.activeFields,
                fields: this.fields,
                context: Object.assign({}, this.context, params.context),
            },
            { changes }
        );
        return this._createRecordDatapoint(values, {
            mode: "edit",
            virtualId: getId("virtual"),
            activeFields: params.activeFields,
        });
    }

    _discard() {
        for (const id in this._cache) {
            this._cache[id]._discard();
        }
        if (this._savePoint._commands) {
            this._commands = this._savePoint._commands;
            this._currentIds = this._savePoint._currentIds;
            this.count = this._savePoint.count;
            delete this._savePoint._commands;
            delete this._savePoint._currentIds;
            delete this._savePoint.count;
        } else {
            this._commands = [];
            this._currentIds = [...this.resIds];
            this.count = this.resIds.length;
        }
        this._unknownRecordCommands = [];
        const limit = this.limit - this._tmpIncreaseLimit;
        this._tmpIncreaseLimit = 0;
        this.model._updateConfig(this.config, { limit }, { noReload: true });
        this.records = this._currentIds
            .slice(this.offset, this.limit)
            .map((resId) => this._cache[resId]);
    }

    _getCommands({ withReadonly } = {}) {
        const { CREATE, UPDATE } = x2ManyCommands;
        const commands = [];
        for (const command of this._commands) {
            if (command[0] === UPDATE && command[1] in this._unknownRecordCommands) {
                // the record has never been loaded, but we received update commands from the
                // server for it, so we need to sanitize them (as they contained unity values)
                const uCommands = this._unknownRecordCommands[command[1]];
                for (const uCommand of uCommands) {
                    const values = fromUnityToServerValues(
                        uCommand[2],
                        this.fields,
                        this.activeFields
                    );
                    commands.push([uCommand[0], uCommand[1], values]);
                }
            } else if (command[0] === CREATE || command[0] === UPDATE) {
                const record = this._cache[command[1]];
                const values = record._getChanges(record._changes, { withReadonly });
                commands.push([command[0], command[1], values]);
            } else {
                commands.push(command);
            }
        }
        return commands;
    }

    async _load({ limit, offset, orderBy }) {
        const currentIds = this._currentIds.slice(offset, offset + limit);
        // FIXME: record in cache could be not yet loaded
        const resIds = currentIds.filter((id) => typeof id === "number" && !this._cache[id]);
        if (resIds.length) {
            const records = await this.model._loadRecords({ ...this.config, resIds });
            for (const record of records) {
                this._createRecordDatapoint(record);
            }
        }
        this.records = currentIds.map((id) => this._cache[id]);
        await this.model._updateConfig(this.config, { limit, offset, orderBy }, { noReload: true });
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

    _updateContext(context) {
        Object.assign(this.context, context);
    }

    // x2many dialog
    addNewRecord(params, withoutParent) {
        return this.model.mutex.exec(async () => {
            Object.assign(this.fields, params.fields);
            const activeFields = { ...params.activeFields };
            for (const fieldName in this.activeFields) {
                if (fieldName in activeFields) {
                    patchActiveFields(activeFields[fieldName], this.activeFields[fieldName]);
                } else {
                    activeFields[fieldName] = this.activeFields[fieldName];
                }
            }
            const record = await this._createNewRecordDatapoint({
                activeFields,
                context: params.context,
                withoutParent,
            });
            record._hasBeenDuplicated = true;
            record._notAddedYet = true;
            return record;
            // const virtualId = getId("virtual");
            // const record = this._createRecordDatapoint()
            // const config = {
            //     ...params,
            //     activeFields,
            //     fields,
            //     resModel: this.resModel,
            //     resId: false,
            //     resIds: [],
            //     isMonoRecord: true,
            // };
            // const data = await this.model._loadData(config);
            // return new this.model.constructor.Record(this.model, config, data, {
            //     virtualId,
            //     parentRecord: this._parent,
            // });
            // const record = this._createRecordDatapoint(data, { virtualId });
            // return this.duplicateDatapoint(record, params);
        });
    }
    duplicateDatapoint(record, params) {
        return this.model.mutex.exec(async () => {
            if (record._hasBeenDuplicated) {
                this.model._updateConfig(record.config, { mode: "edit" }, { noReload: true });
                record._addSavePoint();
                this._lockedRecord = record;
                return record;
            }
            Object.assign(this.fields, params.fields);
            const activeFields = { ...params.activeFields };
            for (const fieldName in record.activeFields) {
                if (fieldName in activeFields) {
                    patchActiveFields(activeFields[fieldName], record.activeFields[fieldName]);
                } else {
                    activeFields[fieldName] = record.activeFields[fieldName];
                }
            }
            const config = {
                ...record.config,
                ...params,
                activeFields,
            };
            let data = {};
            if (!record.isNew) {
                const evalContext = Object.assign({}, record.evalContext, config.context);
                const resIds = [record.resId];
                [data] = await this.model._loadRecords({ ...config, resIds }, evalContext);
            }
            this.model._updateConfig(record.config, config, { noReload: true });
            record._applyDefaultValues();
            for (const fieldName in record.activeFields) {
                if (["one2many", "many2many"].includes(record.fields[fieldName].type)) {
                    if (activeFields[fieldName].related) {
                        const list = record.data[fieldName];
                        const patch = {
                            activeFields: activeFields[fieldName].related.activeFields,
                            fields: activeFields[fieldName].related.fields,
                        };
                        for (const subRecord of Object.values(list._cache)) {
                            this.model._updateConfig(subRecord.config, patch, { noReload: true });
                        }
                        this.model._updateConfig(list.config, patch, { noReload: true });
                    }
                }
            }
            record._applyValues(data);
            record._applyRawChanges();
            record._addSavePoint();
            record._hasBeenDuplicated = true;
            this._lockedRecord = record;
            return record;
        });
    }
}
