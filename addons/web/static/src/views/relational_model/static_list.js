/* @odoo-module */

import { x2ManyCommands } from "@web/core/orm_service";
import { getId } from "./utils";
import { DataPoint } from "./datapoint";

export class StaticList extends DataPoint {
    static type = "StaticList";

    setup(config, data, options = {}) {
        this._parent = options.parent;
        this._onChange = options.onChange;
        this.records = data
            .slice(this.offset, this.limit)
            .map((r) => this._createRecordDatapoint(r));
        this._commands = [];
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
        const record = this._createRecordDatapoint(values, "edit");
        if (params.position === "bottom") {
            this.records.push(record);
        } else {
            this.records.unshift(record);
        }
        this._commands.push([x2ManyCommands.CREATE, getId("virtual"), record]);
        this._onChange();
    }

    canResequence() {
        return false;
    }

    load({ limit, offset }) {
        limit = limit !== undefined ? limit : this.limit;
        offset = offset !== undefined ? offset : this.offset;
        return this.model.mutex.exec(() => this._load({ limit, offset }));
    }

    // FIXME: rename? This is not about selection, but mode
    unselectRecord() {
        if (this.editedRecord) {
            this.switchRecordToReadonly(this.editedRecord);
        }
        return true;
    }

    async switchRecordToReadonly(record) {
        await this.model._updateConfig(record.config, { mode: "readonly" }, { noReload: true });
    }

    async editRecord(record) {
        if (this.editedRecord) {
            await this.editedRecord.save();
            await this.switchRecordToReadonly(this.editedRecord);
        }
        await this.model._updateConfig(record.config, { mode: "edit" }, { noReload: true });
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    _applyCommands(commands) {
        for (const command of commands) {
            switch (command[0]) {
                case x2ManyCommands.CREATE: {
                    const record = this._createRecordDatapoint(command[2]);
                    this.records.push(record);
                    this._commands.push([x2ManyCommands.CREATE, getId("virtual"), record]);
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
                    record._applyChanges(record._applyServerValues(command[2], record.data));
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
                    break;
                }
                case x2ManyCommands.REPLACE_WITH: {
                    // TODO (needs unity + onchange2)
                    break;
                }
            }
        }
    }

    _createRecordDatapoint(data, mode = "readonly") {
        const config = {
            context: this.context,
            activeFields: this.activeFields,
            resModel: this.resModel,
            fields: this.fields,
            resId: data.id || false,
            resIds: data.id ? [data.id] : [],
            mode,
            isMonoRecord: true,
        };
        const options = {
            parentRecord: this._parent,
            onChange: this._onChange,
        };
        return new this.model.constructor.Record(this.model, config, data, options);
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

    async _load({ limit, offset }) {
        const records = await this.model._updateConfig(this.config, { limit, offset });
        // FIXME: might need to keep references to the records of previous page (for changes)
        this.records = records.map((r) => this._createRecordDatapoint(r));
    }
}
