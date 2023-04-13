/* @odoo-module */

import { DataPoint } from "./datapoint";
import { session } from "@web/session";

export class DynamicList extends DataPoint {
    /**
     *
     * @param {import("./relational_model").Config} config
     */
    setup(config) {
        super.setup(...arguments);
        this.domain = config.domain;
        this.groupBy = [];
        this.isDomainSelected = false;
        this.evalContext = this.context;
    }

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    get orderBy() {
        return this.config.orderBy;
    }

    get editedRecord() {
        return this.records.find((record) => record.isInEdition);
    }
    get limit() {
        return this.config.limit;
    }
    get offset() {
        return this.config.offset;
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

    deleteRecords(records = this.selection) {
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
            await this._removeRecords(records);
            return true;
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
        const orderBy = params.orderBy === undefined ? this.config.orderBy : params.orderBy;
        console.log(orderBy);
        return this.model.mutex.exec(() => this._load(offset, limit, orderBy));
    }

    // TODO: keep this??
    selectDomain(value) {
        this.isDomainSelected = value;
    }

    sortBy(fieldName) {
        let orderBy = [...this.config.orderBy];
        if (orderBy.length && orderBy[0].name === fieldName) {
            orderBy[0] = { name: orderBy[0].name, asc: !orderBy[0].asc };
        } else {
            orderBy = orderBy.filter((o) => o.name !== fieldName);
            orderBy.unshift({
                name: fieldName,
                asc: true,
            });
        }
        return this.load({ orderBy });
    }

    unarchive(isSelected) {
        return this.model.mutex.exec(() => this._toggleArchive(isSelected, false));
    }

    async leaveEditMode() {
        if (this.editedRecord) {
            const saved = await this.editedRecord.save();
            if (saved && this.editedRecord) {
                this.model._updateConfig(
                    this.editedRecord.config,
                    { mode: "readonly" },
                    { noReload: true }
                );
            } else {
                return false;
            }
        }
        return true;
    }

    async enterEditMode(record) {
        const canProceed = await this.leaveEditMode();
        if (canProceed) {
            this.model._updateConfig(record.config, { mode: "edit" }, { noReload: true });
        }
        return canProceed;
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    _leaveSampleMode() {
        if (this.model.useSampleModel) {
            this.model.useSampleModel = false;
            return this._load(this.offset, this.limit, this.config.orderBy);
        }
    }

    async _toggleArchive(isSelected, state) {
        const method = state ? "action_archive" : "action_unarchive";
        const context = this.context;
        const resIds = await this.getResIds(isSelected);
        const action = await this.model.orm.call(this.resModel, method, [resIds], { context });
        if (action && Object.keys(action).length) {
            this.model.action.doAction(action, {
                onClose: () => this._load(this.offset, this.limit, this.config.orderBy),
            });
        } else {
            return this._load(this.offset, this.limit, this.config.orderBy);
        }
    }
}
