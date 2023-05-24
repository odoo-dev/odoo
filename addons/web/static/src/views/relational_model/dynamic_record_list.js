/* @odoo-module */

import { DynamicList } from "./dynamic_list";

export class DynamicRecordList extends DynamicList {
    static type = "DynamicRecordList";
    setup(config, data) {
        super.setup(config);
        /** @type {import("./record").Record[]} */
        console.log(data);
        this.records = data.records.map((r) => this._createRecordDatapoint(r));
        this._updateCount(data);
    }

    // -------------------------------------------------------------------------
    // Getter
    // -------------------------------------------------------------------------

    get hasData() {
        return this.count > 0;
    }

    // -------------------------------------------------------------------------
    // Public
    // -------------------------------------------------------------------------

    empty() {
        this.records = [];
        this._updateCount({ length: 0 });
    }

    /**
     * @param {number} resId
     * @param {boolean} [atFirstPosition]
     * @returns {Promise<Record>} the newly created record
     */
    async addExistingRecord(resId, atFirstPosition) {
        const record = this._createRecordDatapoint({});
        await this.model.mutex.exec(() => record._load({ resId }));
        this._addRecord(record, atFirstPosition ? 0 : this.records.length);
        return record;
    }

    /**
     * TODO: rename into "addNewRecord"?
     * @param {boolean} [atFirstPosition=false]
     * @returns {Promise<Record>}
     */
    createRecord(atFirstPosition = false) {
        return this.model.mutex.exec(async () => {
            await this._leaveSampleMode();
            return this._addNewRecord(atFirstPosition);
        });
    }
    /**
     * Performs a search_count with the current domain to set the count. This is
     * useful as web_search_read limits the count for performance reasons, so it
     * might sometimes be less than the real number of records matching the domain.
     **/
    async fetchCount() {
        this.count = await this.model._updateCount(this.config);
        this.hasLimitedCount = false;
        return this.count;
    }

    removeRecord(record) {
        if (!record.isNew) {
            throw new Error("removeRecord can't be called on an existing record");
        }
        const index = this.records.findIndex((r) => r === record);
        if (index < 0) {
            return;
        }
        this.records.splice(index, 1);
        this.count--;
        return record;
    }

    async resequence(movedRecordId, targetRecordId) {
        return this.model.mutex.exec(() => this._moveRecord(movedRecordId, targetRecordId));
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    async _addNewRecord(atFirstPosition) {
        const values = await this.model._loadNewRecord({
            resModel: this.resModel,
            activeFields: this.activeFields,
            fields: this.fields,
            context: this.context,
        });
        const record = this._createRecordDatapoint(values, "edit");
        this._addRecord(record, atFirstPosition ? 0 : this.records.length);
        return record;
    }

    _createRecordDatapoint(data, mode = "readonly") {
        return new this.model.constructor.Record(
            this.model,
            {
                context: this.context,
                activeFields: this.activeFields,
                resModel: this.resModel,
                fields: this.fields,
                resId: data.id || false,
                resIds: data.id ? [data.id] : [],
                isMonoRecord: true,
                mode,
            },
            data
        );
    }

    _addRecord(record, index) {
        this.records.splice(Number.isInteger(index) ? index : this.records.length, 0, record);
        this.count++;
    }

    _removeRecords(records) {
        const _records = this.records.filter((r) => !records.includes(r));
        if (this.offset && !_records.length) {
            // we weren't on the first page, and we removed all records of the current page
            const offset = Math.max(this.offset - this.limit, 0);
            return this._load(offset, this.limit, this.orderBy, this.domain);
        }
        const nbRemovedRecords = this.records.length - _records.length;
        if (nbRemovedRecords > 0) {
            if (this.count > this.offset + this.limit) {
                // we removed some records, and there are other pages after the current one
                return this._load(this.offset, this.limit, this.orderBy, this.domain);
            } else {
                // we are on the last page and there are still records remaining
                this.count -= nbRemovedRecords;
                this.records = _records;
            }
        }
    }

    _updateCount(data) {
        const length = data.length;
        if (length >= this.config.countLimit + 1) {
            this.hasLimitedCount = true;
            this.count = this.config.countLimit;
        } else {
            this.hasLimitedCount = false;
            this.count = length;
        }
    }

    async _load(offset, limit, orderBy, domain) {
        const response = await this.model._updateConfig(this.config, {
            offset,
            limit,
            orderBy,
            domain,
        });
        this.records = response.records.map((r) => this._createRecordDatapoint(r));
        this._updateCount(response);
    }

    async _moveRecord(movedRecordId, targetRecordId) {
        if (!this.canResequence()) {
            return false;
        }
        const handleField = this.model.handleField;
        const originalList = [...this.records];
        const records = this.records;
        const order = this.orderBy.find((o) => o.name === handleField);
        const asc = !order || order.asc;

        // Find indices
        const fromIndex = records.findIndex((r) => r.id === movedRecordId);
        let toIndex = 0;
        if (targetRecordId !== null) {
            const targetIndex = records.findIndex((r) => r.id === targetRecordId);
            toIndex = fromIndex > targetIndex ? targetIndex + 1 : targetIndex;
        }

        const getSequence = (rec) => rec && rec.data[handleField];

        // Determine which records need to be modified
        const firstIndex = Math.min(fromIndex, toIndex);
        const lastIndex = Math.max(fromIndex, toIndex) + 1;
        // let reorderAll = records.some((record) => record.data[handleField] === undefined);
        // if (!reorderAll) {
        // let lastSequence = (asc ? -1 : 1) * Infinity;
        // for (let index = 0; index < records.length; index++) {
        //     const sequence = getSequence(records[index]);
        //     if (
        //         ((index < firstIndex || index >= lastIndex) &&
        //             ((asc && lastSequence >= sequence) ||
        //                 (!asc && lastSequence <= sequence))) ||
        //         (index >= firstIndex && index < lastIndex && lastSequence === sequence)
        //     ) {
        //         reorderAll = true;
        //     }
        //     lastSequence = sequence;
        // }
        // }

        // Perform the resequence in the list of records
        const [record] = records.splice(fromIndex, 1);
        records.splice(toIndex, 0, record);

        // Creates the list of records to modify
        let toReorder = records;
        // if (!reorderAll) {
        toReorder = toReorder.slice(firstIndex, lastIndex).filter((r) => r.id !== movedRecordId);
        if (fromIndex < toIndex) {
            toReorder.push(record);
        } else {
            toReorder.unshift(record);
        }
        // }
        if (!asc) {
            toReorder.reverse();
        }

        const resIds = toReorder.map((r) => r.resId).filter((resId) => resId && !isNaN(resId));
        const sequences = toReorder.map(getSequence);
        const offset = sequences.length && Math.min(...sequences);

        // Try to write new sequences on the affected records
        const params = {
            model: this.resModel,
            ids: resIds,
            context: this.context,
            field: handleField,
        };
        if (offset) {
            params.offset = offset;
        }
        const wasResequenced = await this.model.rpc("/web/dataset/resequence", params);
        if (!wasResequenced) {
            this.records = originalList;
            return false;
        }

        // Read the actual values set by the server and update the records
        const kwargs = { context: this.context };
        const result = await this.model.orm.read(this.resModel, resIds, [handleField], kwargs);
        for (const recordData of result) {
            const record = records.find((r) => r.resId === recordData.id);
            record._applyValues(recordData);
        }

        return true;
    }
}
