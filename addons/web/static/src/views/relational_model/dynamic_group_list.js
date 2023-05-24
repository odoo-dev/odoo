/* @odoo-module */
//@ts-check

import { DynamicList } from "./dynamic_list";

export class DynamicGroupList extends DynamicList {
    static type = "DynamicGroupList";

    /**
     *
     * @param {import("./relational_model").Config} config
     */
    setup(config, data) {
        super.setup(...arguments);
        this.isGrouped = true;
        this.groupBy = config.groupBy;
        this.groupByField = this.fields[this.groupBy[0].split(":")[0]];
        /** @type {import("./group").Group[]} */
        this.groups = data.groups.map((g) => this._createGroupDatapoint(g));
        this.count = data.length;
    }

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    empty() {
        this.groups = [];
        this.count = 0;
    }

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

    async createGroup(groupName, groupData, isFolded) {
        await this.model.mutex.exec(() => this._createGroup(groupName, groupData, isFolded));
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    async _createGroup(groupName, groupData = {}, isFolded = false) {
        groupData = { ...groupData, name: groupName };
        const [id] = await this.model.orm.create(this.groupByField.relation, [groupData], {
            context: this.context,
        });

        // This is almost a copy/past of the code in relational_model.js
        // Maybe we can create an addGroup method in relational_model.js
        // and call it from here and from relational_model.js
        const commonConfig = {
            resModel: this.config.resModel,
            fields: this.config.fields,
            activeFields: this.config.activeFields,
        };
        const context = {
            ...this.config.context,
            [`default_${this.groupByField.name}`]: id,
        };
        const nextConfigGroups = { ...this.config.groups };
        nextConfigGroups[id] = {
            ...commonConfig,
            context,
            groupByFieldName: this.groupByField.name,
            isFolded,
            list: {
                ...commonConfig,
                context,
                domain: [[this.groupByField.name, "=", id]],
                groupBy: [],
                orderBy: this.orderBy,
            },
        };
        this.model._updateConfig(this.config, { groups: nextConfigGroups }, { noReload: true });

        const data = {
            count: 0,
            length: 0,
            records: [],
            __domain: [[this.groupByField.name, "=", id]],
            [this.groupByField.name]: [id, groupName],
            value: id,
            displayName: groupName,
        };

        this.groups.push(this._createGroupDatapoint(data));
    }

    _createGroupDatapoint(data) {
        return new this.model.constructor.Group(this.model, this.config.groups[data.value], data);
    }

    async _load(offset, limit, orderBy, domain) {
        const response = await this.model._updateConfig(this.config, {
            offset,
            limit,
            orderBy,
            domain,
        });
        this.groups = response.groups.map((group) => this._createGroupDatapoint(group));
        this.count = response.length;
    }

    _removeRecords(records) {
        const proms = [];
        for (const group of this.groups) {
            proms.push(group._removeRecords(records));
        }
        return Promise.all(proms);
    }

    /**
     * @param {string} dataRecordId
     * @param {string} dataGroupId
     * @param {string} refId
     * @param {string} targetGroupId
     */
    async moveRecord(dataRecordId, dataGroupId, refId, targetGroupId) {
        const targetGroup = this.groups.find((g) => g.id === targetGroupId);
        if (dataGroupId === targetGroupId) {
            // move a record inside the same group
            return targetGroup.list._moveRecord(dataRecordId, refId);
        }

        // move record from a group to another group
        const sourceGroup = this.groups.find((g) => g.id === dataGroupId);
        const recordIndex = sourceGroup.list.records.findIndex((r) => r.id === dataRecordId);
        const record = sourceGroup.list.records[recordIndex];
        // step 1: move record to correct position
        const refIndex = targetGroup.list.records.findIndex((r) => r.id === refId);
        sourceGroup._removeRecords([record]);
        targetGroup.addRecord(record, refIndex + 1);
        // step 2: update record value
        const value =
            targetGroup.groupByField.type === "many2one"
                ? [targetGroup.value, targetGroup.displayName]
                : targetGroup.value;
        await record.update({ [this.groupByField.name]: value });
        await record.save({ noReload: true });
        const succeeded = await targetGroup.list._moveRecord(dataRecordId, refId);
        if (!succeeded) {
            // TODO: put record back to its original group ?
        }
    }
}
