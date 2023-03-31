/* @odoo-module */

import { DataPoint } from "./datapoint";
import { session } from "@web/session";

export class DynamicList extends DataPoint {
    setup(params) {
        super.setup(params);
        this.orderBy = params.orderBy || [];
        this.domain = params.domain;
        this.groupBy = [];
        this.limit = params.limit || 80;
        this.offset = params.offset || 0;
        this.isDomainSelected = false;
        this.evalContext = this.context;
    }

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    get editedRecord() {
        return this.records.find((record) => record.isInEdition);
    }

    get selection() {
        return this.records.filter((record) => record.selected);
    }

    // -------------------------------------------------------------------------
    // Public
    // -------------------------------------------------------------------------

    archive(isSelected) {
        return this.model.mutex.exec(() => this._toggleArchive(isSelected, true));
    }

    canResequence() {
        return false;
    }

    deleteRecords(records) {
        return this.model.mutex.exec(async () => {
            const unlinked = await this.model.orm.unlink(
                this.resModel,
                records.map((r) => r.resId),
                {
                    context: this.context,
                }
            );
            if (!unlinked) {
                return false;
            }
            return this._removeRecords(records);
        });
    }

    /**
     * @param {boolean} [isSelected]
     * @returns {Promise<number[]>}
     */
    async getResIds(isSelected) {
        let resIds;
        if (isSelected) {
            if (this.isDomainSelected) {
                resIds = await this.model.orm.search(this.resModel, this.domain, {
                    limit: session.active_ids_limit,
                    context: this.context,
                });
            } else {
                resIds = this.selection.map((r) => r.resId);
            }
        } else {
            resIds = this.records.map((r) => r.resId);
        }
        return resIds;
    }

    load(params = {}) {
        const limit = params.limit === undefined ? this.limit : params.limit;
        const offset = params.offset === undefined ? this.offset : params.offset;
        const orderBy = params.orderBy === undefined ? this.orderBy : params.orderBy;
        return this.model.mutex.exec(() => this._load(offset, limit, orderBy));
    }

    // TODO: keep this??
    selectDomain(value) {
        this.isDomainSelected = value;
    }

    async sortBy(fieldName) {
        let orderBy = [...this.orderBy];
        if (orderBy.length && orderBy[0].name === fieldName) {
            // if (this.isOrder) {
            orderBy[0] = { name: orderBy[0].name, asc: !orderBy[0].asc };
            // }
        } else {
            orderBy = orderBy.filter((o) => o.name !== fieldName);
            orderBy.unshift({
                name: fieldName,
                asc: true,
            });
        }

        // this.isOrder = true;
        await this.load({ orderBy });
    }

    unarchive(isSelected) {
        return this.model.mutex.exec(() => this._toggleArchive(isSelected, false));
    }

    // FIXME: rename? This is not about selection, but mode
    async unselectRecord() {
        if (this.editedRecord) {
            const saved = await this.editedRecord.save();
            if (saved) {
                this.editedRecord.switchMode("readonly");
            }
        }
        return true;
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    async _toggleArchive(isSelected, state) {
        const method = state ? "action_archive" : "action_unarchive";
        const context = this.context;
        const resIds = await this.getResIds(isSelected);
        const action = await this.model.orm.call(this.resModel, method, [resIds], { context });
        if (action && Object.keys(action).length) {
            this.model.action.doAction(action, { onClose: () => this._load() });
        } else {
            return this._load();
        }
    }
}
