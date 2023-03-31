/* @odoo-module */

import { DynamicList } from "./dynamic_list";

export class DynamicRecordList extends DynamicList {
    setup(params) {
        super.setup(params);
        /** @type {import("./record").Record[]} */
        this.records = params.data.records.map((r) => this._createRecordDatapoint(r));
        this._updateCount(params.data);
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

    /**
     * TODO: rename into "addNewRecord"?
     * @param {boolean} [atFirstPosition=false]
     * @returns {Promise}
     */
    createRecord(atFirstPosition = false) {
        return this.model.mutex.exec(() => this._addNewRecord(atFirstPosition));
    }
    /**
     * Performs a search_count with the current domain to set the count. This is
     * useful as web_search_read limits the count for performance reasons, so it
     * might sometimes be less than the real number of records matching the domain.
     **/
    async fetchCount() {
        const keepLast = this.model.keepLast;
        this.count = await keepLast.add(this.model.orm.searchCount(this.resModel, this.domain));
        this.hasLimitedCount = false;
        return this.count;
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    async _addNewRecord(atFirstPosition) {
        const values = await this.model._loadNewRecord({
            resModel: this.resModel,
            activeFields: this.activeFields,
            context: this.context,
        });
        const record = this._createRecordDatapoint(values, "edit");
        if (atFirstPosition) {
            this.records.unshift(record);
        } else {
            this.records.push(record);
        }
        this.count++;
    }

    _createRecordDatapoint(data, mode = "readonly") {
        return new this.model.constructor.Record(this.model, {
            context: this.context,
            activeFields: this.activeFields,
            resModel: this.resModel,
            fields: this.fields,
            data,
            mode,
        });
    }

    _removeRecords(records) {
        const _records = this.records.filter((r) => !records.includes(r));
        if (this.offset && !_records.length) {
            const offset = Math.max(this.offset - this.limit, 0);
            return this._load(offset, this.limit);
        }
        this.records = _records;
        this._updateCount(this.records); // FIXME: this is not correct I think (multi page, delete a record)
    }

    _updateCount(data) {
        const length = data.length;
        if (length >= this.model.countLimit + 1) {
            this.hasLimitedCount = true;
            this.count = this.model.countLimit;
        } else {
            this.hasLimitedCount = false;
            this.count = length;
        }
    }

    async _load(offset, limit, orderBy) {
        const response = await this.model._loadUngroupedList({
            activeFields: this.activeFields,
            context: this.context,
            domain: this.domain,
            fields: this.fields,
            limit,
            offset,
            orderBy,
            resModel: this.resModel,
        });
        this.records = response.records.map(
            (r) =>
                new this.model.constructor.Record(this.model, {
                    activeFields: this.activeFields,
                    fields: this.fields,
                    resModel: this.resModel,
                    context: this.context,
                    resIds: response.records.map((r) => r.id),
                    data: r,
                })
        );
        this.offset = offset;
        this.limit = limit;
        this.orderBy = orderBy;
        this._updateCount(response);
    }
}
