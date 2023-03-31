/* @odoo-module */

import { DynamicList } from "./dynamic_list";

export class DynamicGroupList extends DynamicList {
    static DEFAULT_LOAD_LIMIT = 10; // FIXME: move

    setup(params) {
        super.setup(params);
        this.isGrouped = true;
        this.groupBy = params.groupBy;
        this.groupByField = this.fields[this.groupBy[0].split(":")[0]];
        /** @type {import("./group").Group[]} */
        this.groups = params.data.groups.map((g) => this._createGroupDatapoint(g));
    }

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    get hasData() {
        if (this.count === 0) {
            return false;
        }
        return this.groups.some((group) => group.hasData);
    }

    /**
     * List of loaded records inside groups.
     * @returns {import("./record").Record[]}
     */
    get records() {
        return this.groups
            .filter((group) => !group.isFolded)
            .map((group) => group.records)
            .flat();
    }

    /**
     * FIXME: only for list, but makes sense, maybe rename into recordCount?
     * count already exists and is the number of groups
     *
     * @returns {number}
     */
    get nbTotalRecords() {
        return this.groups.reduce((acc, group) => acc + group.count, 0);
    }

    async sortBy(fieldName) {
        if (!this.groups.length) {
            return;
        }
        if (this.groups.every((group) => group.isFolded)) {
            // all groups are folded
            if (this.groupByField.name !== fieldName) {
                // grouped by another field than fieldName
                if (!(fieldName in this.groups[0].aggregates)) {
                    // fieldName has no aggregate values
                    return;
                }
            }
        }
        return super.sortBy(fieldName);
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    _createGroupDatapoint(data) {
        return new this.model.constructor.Group(this.model, {
            activeFields: this.activeFields,
            fields: this.fields,
            resModel: this.resModel,
            context: this.context,
            groupBy: this.groupBy.slice(1),
            groupByFieldName: this.groupByField.name,
            data,
        });
    }

    async _load(offset, limit, orderBy) {
        const response = await this.model._loadGroupedList({
            activeFields: this.activeFields,
            context: this.context,
            domain: this.domain,
            fields: this.fields,
            groupBy: this.groupBy,
            orderBy: orderBy,
            resModel: this.resModel,
            limit,
            offset,
        });
        this.groups = response.groups.map((g) => this._createGroupDatapoint(g));
        this.count = response.length;
        this.offset = offset;
        this.limit = limit;
        this.orderBy = orderBy;
    }

    _removeRecords(records) {
        for (const group of this.groups) {
            group.list._removeRecords(records);
        }
    }
}
