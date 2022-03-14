/** @odoo-module **/

import { Domain } from "@web/core/domain";
import { isRelational } from "@web/views/helpers/view_utils";
import {
    DynamicGroupList,
    DynamicRecordList,
    Group,
    RelationalModel,
} from "@web/views/relational_model";

/**
 * @typedef ProgressBar
 * @property {number} count
 * @property {any} value
 * @property {string} color
 * @property {string} string
 */

const { DateTime } = luxon;
const { EventBus, markRaw } = owl;

const FALSE = Symbol("false");

const isValueEqual = (v1, v2) => (v1 instanceof DateTime ? v1.equals(v2) : v1 === v2);

const useTransaction = () => {
    const bus = new EventBus();
    let started = false;
    return {
        start: () => {
            if (started) {
                throw new Error(`Transaction in progress: commit or abort to start a new one.`);
            }
            started = true;
            bus.trigger("START");
        },
        commit: () => {
            if (!started) {
                throw new Error(`No transaction in progress.`);
            }
            started = false;
            bus.trigger("COMMIT");
        },
        abort: () => {
            if (!started) {
                throw new Error(`No transaction in progress.`);
            }
            started = false;
            bus.trigger("ABORT");
        },
        register: ({ onStart, onCommit, onAbort }) => {
            let currentData = null;
            bus.addEventListener("START", () => onStart && (currentData = onStart()));
            bus.addEventListener("COMMIT", () => onCommit && onCommit(currentData));
            bus.addEventListener("ABORT", () => onAbort && onAbort(currentData));
        },
    };
};

class KanbanGroup extends Group {
    setup(_params, state = {}) {
        super.setup(...arguments);

        /** @type {ProgressBar[]} */
        this.progressBars = this._generateProgressBars();
        this.progressValue = markRaw(state.progressValue || { active: null });

        this.model.transaction.register({
            onStart: () => ({
                count: this.count,
                progressBars: [...this.progressBars],
                records: [...this.list.records],
            }),
            onAbort: ({ count, progressBars, records }) => {
                this.count = count;
                this.progressBars = progressBars;
                this.list.records = records;
            },
        });

        this.model.addEventListener("record-updated", ({ detail }) => {
            if (this.list.records.some((r) => r.id === detail.record.id)) {
                this.model.trigger("group-updated", {
                    group: this,
                    withProgressBars: true,
                });
            }
        });
    }

    get activeProgressBar() {
        return (
            this.hasActiveProgressValue &&
            this.progressBars.find((pv) => pv.value === this.progressValue.active)
        );
    }

    get hasActiveProgressValue() {
        return this.model.hasProgressBars && this.progressValue.active !== null;
    }

    /**
     * @override
     */
    async deleteRecords() {
        const records = await super.deleteRecords(...arguments);
        this.model.trigger("group-updated", {
            group: this,
            withProgressBars: true,
        });
        return records;
    }

    /**
     * @override
     */
    empty() {
        super.empty();

        this.progressValue.active = null;
        for (const progressBar of this.progressBars) {
            progressBar.count = 0;
        }
    }

    /**
     * @override
     */
    exportState() {
        return {
            ...super.exportState(),
            progressValue: this.progressValue,
        };
    }

    /**
     * @override
     */
    getAggregableRecords() {
        const records = super.getAggregableRecords();
        if (!this.hasActiveProgressValue) {
            return records;
        }
        const { fieldName } = this.model.progressAttributes;
        let recordsFilter;
        if (this.progressValue.active === FALSE) {
            const values = this.progressBars
                .map((pv) => pv.value)
                .filter((val) => val !== this.progressValue.active);
            recordsFilter = (r) => !values.includes(r.data[fieldName]);
        } else {
            recordsFilter = (r) => r.data[fieldName] === this.progressValue.active;
        }
        return records.filter(recordsFilter);
    }

    /**
     * @override
     */
    quickCreate(activeFields, context) {
        const ctx = { ...context };
        if (this.hasActiveProgressValue && this.progressValue.active !== FALSE) {
            const { fieldName } = this.model.progressAttributes;
            ctx[`default_${fieldName}`] = this.progressValue.active;
        }
        return super.quickCreate(activeFields, ctx);
    }

    /**
     * Checks if the current active progress bar value contains records, and
     * deactivates it if not.
     * @returns {Promise<void>}
     */
    async checkActiveValue() {
        if (!this.hasActiveProgressValue) {
            return;
        }
        if (this.activeProgressBar.count === 0) {
            await this.filterProgressValue(null);
        }
    }

    async filterProgressValue(value) {
        this.progressValue.active = this.progressValue.active === value ? null : value;
        this.list.domain = this.getProgressBarDomain();

        // Do not update progress bars data when filtering on them.
        this.model.trigger("group-updated", { group: this, withProgressBars: false });
        await Promise.all([this.list.load()]);
    }

    /**
     * @param {Object} record
     * @returns {ProgressBar}
     */
    findProgressValueFromRecord(record) {
        const { fieldName } = this.model.progressAttributes;
        const value = record.data[fieldName];
        return (
            this.progressBars.find((pv) => pv.value === value) ||
            this.progressBars.find((pv) => pv.value === FALSE)
        );
    }

    /**
     * @override
     */
    getAggregates(fieldName) {
        if (!this.hasActiveProgressValue) {
            return super.getAggregates(...arguments);
        }
        return fieldName ? this.aggregates[fieldName] : this.activeProgressBar.count;
    }

    getProgressBarDomain() {
        const { fieldName } = this.model.progressAttributes;
        const domains = [this.groupDomain];
        if (this.hasActiveProgressValue) {
            if (this.progressValue.active === FALSE) {
                const values = this.progressBars
                    .map((pv) => pv.value)
                    .filter((val) => val !== this.progressValue.active);
                domains.push(["!", [fieldName, "in", values]]);
            } else {
                domains.push([[fieldName, "=", this.progressValue.active]]);
            }
        }
        return Domain.and(domains).toList();
    }

    updateAggregates(groupData) {
        const fname = this.groupByField.name;
        const { sumField } = this.model.progressAttributes;
        const group = groupData.find((g) => isValueEqual(g[fname], this.value));
        if (sumField) {
            this.aggregates[sumField.name] = group ? group[sumField.name] : 0;
        }
    }

    /**
     * @param {Object} [progressData]
     * @returns {Promise<void>}
     */
    async updateProgressData(progressData) {
        /** @type {Record<string, number>} */
        const groupProgressData = progressData[this.displayName || this.value] || {};
        /** @type {Map<string | symbol, number>} */
        const counts = new Map(
            groupProgressData ? Object.entries(groupProgressData) : [[FALSE, this.count]]
        );
        const total = [...counts.values()].reduce((acc, c) => acc + c, 0);
        counts.set(FALSE, this.count - total);
        for (const pv of this.progressBars) {
            pv.count = counts.get(pv.value) || 0;
        }
        await this.checkActiveValue();
    }

    // ------------------------------------------------------------------------
    // Protected
    // ------------------------------------------------------------------------

    /**
     * @returns {ProgressBar[]}
     */
    _generateProgressBars() {
        if (!this.model.hasProgressBars) {
            return [];
        }
        const { colors, fieldName } = this.model.progressAttributes;
        const { selection: fieldSelection } = this.fields[fieldName];
        /** @type {[string | typeof FALSE, string][]} */
        const colorEntries = Object.entries(colors);
        const selection = fieldSelection && Object.fromEntries(fieldSelection);

        if (!colorEntries.some((v) => v[1] === "muted")) {
            colorEntries.push([FALSE, "muted"]);
        }

        return colorEntries.map(([value, color]) => {
            let string;
            if (value === FALSE) {
                string = this.model.env._t("Other");
            } else if (selection) {
                string = selection[value];
            } else {
                string = String(value);
            }
            return { count: 0, value, string, color };
        });
    }
}

class KanbanDynamicGroupList extends DynamicGroupList {
    setup(_params, state = {}) {
        super.setup(...arguments);

        this.previousParams = state.previousParams || "";
        this.model.addEventListener("group-updated", ({ detail }) => {
            if (this.groups.some((g) => g.id === detail.group.id)) {
                this.updateGroupProgressData([detail.group], detail.withProgressBars);
            }
        });
    }

    /**
     * After a reload, empty groups are expcted to disappear from the web_read_group.
     * However, if the parameters are the same (domain + groupBy), we want to
     * temporarily keep these empty groups in the interface until the next reload
     * with different parameters.
     * @override
     */
    async load() {
        const oldGroups = this.groups.map((g, i) => [g, i]);
        await this._loadWithProgressData(super.load());
        if (this.previousParams === JSON.stringify([this.domain, this.groupBy])) {
            for (const [group, index] of oldGroups) {
                const newGroup = this.groups.find((g) => isValueEqual(g.value, group.value));
                if (!newGroup) {
                    group.empty();
                    this.groups.splice(index, 0, group);
                }
            }
        }
    }

    /**
     * @override
     */
    exportState() {
        return {
            ...super.exportState(),
            previousParams: JSON.stringify([this.domain, this.groupBy]),
        };
    }

    /**
     * @param {KanbanGroup[]} groups
     * @param {boolean} withProgressBars
     * @returns {Promise<void>}
     */
    async updateGroupProgressData(groups, withProgressBars) {
        if (!this.model.hasProgressBars) {
            return;
        }

        const { fieldName, sumField } = this.model.progressAttributes;
        const fieldNames = [];
        const gbFieldName = this.groupByField.name;
        const promises = {};

        if (withProgressBars) {
            const domain = Domain.or(groups.map((g) => g.groupDomain)).toList();
            fieldNames.push(fieldName);
            promises.readProgressBar = this._fetchProgressData(domain);
        }
        // If we have a sumField, the aggregates must be re-fetched
        if (sumField) {
            const domain = Domain.or(groups.map((g) => g.getProgressBarDomain())).toList();
            fieldNames.push(sumField.name);
            promises.webReadGroup = this.model.orm.webReadGroup(
                this.resModel,
                domain,
                fieldNames,
                this.groupBy,
                {
                    limit: this.groupLimit,
                    lazy: true,
                }
            );
        }

        await Promise.all(Object.values(promises));

        // Update the aggregates for each group
        if (promises.webReadGroup) {
            const result = await promises.webReadGroup;
            const groupData = result.groups.map((group) => ({
                ...group,
                [gbFieldName]: Array.isArray(group[gbFieldName])
                    ? group[gbFieldName][0]
                    : group[gbFieldName],
            }));
            for (const group of groups) {
                group.updateAggregates(groupData);
            }
        }
        // Update the progress bar data for each group
        if (promises.readProgressBar) {
            const result = await promises.readProgressBar;
            await Promise.all(groups.map((group) => group.updateProgressData(result)));
        }

        this.model.notify();
    }

    /**
     * @param {string} dataRecordId
     * @param {string} dataGroupId
     * @param {string} refId
     * @param {string} targetGroupId
     * @returns {Promise<void>}
     */
    async moveRecord(dataRecordId, dataGroupId, refId, targetGroupId) {
        const sourceGroup = this.groups.find((g) => g.id === dataGroupId);
        const targetGroup = this.groups.find((g) => g.id === targetGroupId);

        if (!sourceGroup || !targetGroup) {
            return; // Groups have been re-rendered, old ids are ignored
        }

        this.model.transaction.start();

        // Quick update: moves the record at the right position and notifies components
        const record = sourceGroup.list.records.find((r) => r.id === dataRecordId);
        const refIndex = targetGroup.list.records.findIndex((r) => r.id === refId);
        targetGroup.addRecord(sourceGroup.removeRecord(record), refIndex >= 0 ? refIndex + 1 : 0);

        // Move from one group to another
        try {
            if (dataGroupId !== targetGroupId) {
                const value = isRelational(this.groupByField)
                    ? [targetGroup.value]
                    : targetGroup.value;
                await record.update(this.groupByField.name, value);
                await record.save({ noReload: true });
                // Record can be loaded along with the group metadata
                await Promise.all([
                    this.updateGroupProgressData([sourceGroup, targetGroup], true),
                    record.load(),
                ]);
            }
            await targetGroup.list.resequence();
        } catch (err) {
            this.model.transaction.abort();
            this.model.notify();
            throw err;
        }
        this.model.transaction.commit();
        this.model.notify();
    }

    // ------------------------------------------------------------------------
    // Protected
    // ------------------------------------------------------------------------

    /**
     * @param {any[]} [domain]
     * @returns {Promise<Object>}
     */
    async _fetchProgressData(domain) {
        const { colors, fieldName, help, sumField } = this.model.progressAttributes;
        return this.model.orm.call(this.resModel, "read_progress_bar", [], {
            domain,
            group_by: this.firstGroupBy,
            progress_bar: {
                colors,
                field: fieldName,
                help,
                sum_field: sumField && sumField.name,
            },
            context: this.context,
        });
    }

    /**
     * @param {Promise<any>} loadPromise
     * @returns {Promise<void>}
     */
    async _loadWithProgressData(loadPromise) {
        if (!this.model.hasProgressBars) {
            // No progress attributes : normal load
            return loadPromise;
        }
        const [progressData] = await Promise.all([
            this._fetchProgressData(this.domain),
            loadPromise,
        ]);
        await Promise.all(this.groups.map((group) => group.updateProgressData(progressData)));
    }
}

class KanbanDynamicRecordList extends DynamicRecordList {
    async moveRecord(dataRecordId, _dataGroupId, refId) {
        this.model.transaction.start();

        // Quick update: moves the record at the right position and notifies components
        const record = this.records.find((r) => r.id === dataRecordId);
        const refIndex = this.records.findIndex((r) => r.id === refId);
        this.addRecord(this.removeRecord(record), refIndex >= 0 ? refIndex + 1 : 0);

        try {
            await this.resequence();
        } catch (err) {
            this.model.transaction.abort();
            this.model.notify();
            throw err;
        }
        this.model.transaction.commit();
    }
}

KanbanDynamicRecordList.DEFAULT_LIMIT = 40;

export class KanbanModel extends RelationalModel {
    setup(params) {
        super.setup(...arguments);

        this.progressAttributes = params.progressAttributes;
        this.transaction = useTransaction();
    }

    get hasProgressBars() {
        return Boolean(this.progressAttributes);
    }

    /**
     * @override
     */
    hasData() {
        if (this.root.groups) {
            if (!this.root.groups.length) {
                // While we don't have any data, we want to display the column quick create and
                // example background. Return true so that we don't get sample data instead
                return true;
            }
            return this.root.groups.some((group) => group.list.records.length > 0);
        }
        return this.root.records.length > 0;
    }
}

KanbanModel.services = [...RelationalModel.services, "view"];
KanbanModel.DynamicGroupList = KanbanDynamicGroupList;
KanbanModel.DynamicRecordList = KanbanDynamicRecordList;
KanbanModel.Group = KanbanGroup;
