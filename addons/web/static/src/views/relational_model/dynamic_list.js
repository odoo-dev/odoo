/* @odoo-module */

import { DataPoint } from "./datapoint";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { sprintf } from "@web/core/utils/strings";
import { session } from "@web/session";

export class DynamicList extends DataPoint {
    /**
     *
     * @param {import("./relational_model").Config} config
     */
    setup(config) {
        super.setup(...arguments);
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
    get domain() {
        return this.config.domain;
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
        return !!this.model.handleField;
    }

    deleteRecords(records = []) {
        return this.model.mutex.exec(() => this._deleteRecords(records));
    }

    async _deleteRecords(records) {
        let resIds;
        if (records.length) {
            resIds = records.map((r) => r.resId);
        } else {
            resIds = await this.getResIds(true);
            records = this.records.filter((r) => resIds.includes(r.resId));
        }
        const unliked = await this.model.orm.unlink(this.resModel, resIds, {
            context: this.context,
        });
        if (!unliked) {
            return false;
        }
        if (
            this.isDomainSelected &&
            resIds.length === session.active_ids_limit &&
            resIds.length < this.count
        ) {
            const msg = sprintf(
                _t(`Only the first %s records have been deleted (out of %s selected)`),
                resIds.length,
                this.count
            );
            this.model.notification.add(msg, { title: _t("Warning") });
        }
        await this._removeRecords(records);
        return unliked;
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
        const domain = params.domain === undefined ? this.domain : params.domain;
        return this.model.mutex.exec(() => this._load(offset, limit, orderBy, domain));
    }

    async multiSave(record) {
        return this.model.mutex.exec(() => this._multiSave(record));
    }

    // TODO: keep this??
    selectDomain(value) {
        this.isDomainSelected = value;
    }

    sortBy(fieldName) {
        let orderBy = [...this.orderBy];
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

    async leaveEditMode({ discard } = {}) {
        if (this.editedRecord) {
            let canProceed = true;
            if (discard) {
                await this.editedRecord.discard();
                if (this.editedRecord && this.editedRecord.isNew) {
                    this._removeRecords([this.editedRecord]);
                }
            } else {
                if (!this.model._urgentSave) {
                    await this.editedRecord.checkValidity();
                    if (!this.editedRecord) {
                        return true;
                    }
                }
                if (this.editedRecord.isNew && !this.editedRecord.isDirty) {
                    this._removeRecords([this.editedRecord]);
                } else {
                    canProceed = await this.editedRecord.save();
                }
            }

            if (canProceed && this.editedRecord) {
                this.model._updateConfig(
                    this.editedRecord.config,
                    { mode: "readonly" },
                    { noReload: true }
                );
            } else {
                return canProceed;
            }
        }
        return true;
    }

    async enterEditMode(record) {
        if (this.editedRecord === record) {
            return true;
        }
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
            return this._load(this.offset, this.limit, this.orderBy, this.domain);
        }
    }

    async _toggleArchive(isSelected, state) {
        const method = state ? "action_archive" : "action_unarchive";
        const context = this.context;
        const resIds = await this.getResIds(isSelected);
        const action = await this.model.orm.call(this.resModel, method, [resIds], { context });
        if (
            this.isDomainSelected &&
            resIds.length === session.active_ids_limit &&
            resIds.length < this.count
        ) {
            const msg = sprintf(
                _t("Of the %s records selected, only the first %s have been archived/unarchived."),
                resIds.length,
                this.count
            );
            this.model.notification.add(msg, { title: _t("Warning") });
        }
        const reload = () => this.model.load();
        if (action && Object.keys(action).length) {
            this.model.action.doAction(action, {
                onClose: reload,
            });
        } else {
            return reload();
        }
    }

    async _multiSave(record) {
        const changes = record._getChanges();
        if (!Object.keys(changes).length) {
            return;
        }
        const validSelection = this.selection.filter((record) => {
            return Object.keys(changes).every((fieldName) => {
                if (record._isReadonly(fieldName)) {
                    return false;
                } else if (record._isRequired(fieldName) && !changes[fieldName]) {
                    return false;
                }
                return true;
            });
        });
        const canProceed = await this.model.hooks.onWillSaveMulti(record, changes, validSelection);
        if (canProceed === false) {
            return false;
        }
        if (validSelection.length === 0) {
            this.model.dialog.add(AlertDialog, {
                body: _t("No valid record to save"),
                confirm: () => this.leaveEditMode({ discard: true }),
            });
            return false;
        } else {
            const resIds = validSelection.map((r) => r.resId);
            const context = this.context;
            try {
                await this.model.orm.write(this.resModel, resIds, changes, { context });
            } catch (e) {
                record._discard();
                this.model._updateConfig(record.config, { mode: "readonly" }, { noReload: true });
                throw e;
            }
            const records = await this.model._loadRecords({ ...this.config, resIds });
            for (const record of validSelection) {
                const serverValues = records.find((r) => r.id === record.resId);
                record._applyValues(serverValues);
                this.model._updateSimilarRecords(record, serverValues);
            }
            record._discard();
            this.model._updateConfig(record.config, { mode: "readonly" }, { noReload: true });
        }
        this.model.hooks.onSavedMulti(validSelection);
        return true;
    }
}
