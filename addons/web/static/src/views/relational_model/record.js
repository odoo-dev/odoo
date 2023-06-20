/* @odoo-module */

import { markRaw, markup, toRaw } from "@odoo/owl";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { Domain } from "@web/core/domain";
import { serializeDate, serializeDateTime } from "@web/core/l10n/dates";
import { _t } from "@web/core/l10n/translation";
import { escape } from "@web/core/utils/strings";
import { evalDomain, isNumeric, isX2Many } from "@web/views/utils";
import { DataPoint } from "./datapoint";
import { getFieldContext, parseServerValue } from "./utils";

export class Record extends DataPoint {
    static type = "Record";
    setup(config, data, options = {}) {
        this._parentRecord = options.parentRecord;
        this._onChange = options.onChange || (() => {});
        this.virtualId = options.virtualId || false;

        const missingFields = this.fieldNames.filter((fieldName) => !(fieldName in data));
        const vals = this._parseServerValues({
            ...this._getDefaultValues(missingFields),
            ...data,
        });
        if (this.resId) {
            this._values = markRaw(vals);
            this._changes = markRaw({});
        } else {
            this._values = markRaw({});
            this._changes = markRaw(vals);
        }
        this._savePoint = markRaw({
            dirty: false,
            changes: { ...this._changes },
        });
        this.data = { ...this._values, ...this._changes };
        const parentRecord = this._parentRecord;
        if (parentRecord) {
            this.evalContext = {
                get parent() {
                    return parentRecord.evalContext;
                },
            };
        } else {
            this.evalContext = {};
        }
        this._setDataContext();

        this._manuallyAdded = options.manuallyAdded === true;
        this.selected = false;
        // Be careful that pending changes might not have been notified yet, so the "dirty" flag may
        // be false even though there are changes in a field. Consider calling "isDirty()" instead.
        this.dirty = false;
        this._invalidFields = new Set();
        this._unsetRequiredFields = markRaw(new Set());
        this._closeInvalidFieldsNotification = () => {};
    }

    // -------------------------------------------------------------------------
    // Getter
    // -------------------------------------------------------------------------

    get canBeAbandoned() {
        return this.isNew && !this.dirty && this._manuallyAdded;
    }

    get hasData() {
        return true;
    }

    get isActive() {
        if ("active" in this.activeFields) {
            return this.data.active;
        } else if ("x_active" in this.activeFields) {
            return this.data.x_active;
        }
        return true;
    }

    get isNew() {
        return !this.resId;
    }

    get isValid() {
        return !this._invalidFields.size;
    }

    get resId() {
        return this.config.resId;
    }

    get resIds() {
        return this.config.resIds;
    }

    get isInEdition() {
        if (this.config.mode === "readonly") {
            return false;
        } else {
            return this.config.mode === "edit" || !this.resId;
        }
    }

    // -------------------------------------------------------------------------
    // Public
    // -------------------------------------------------------------------------

    archive() {
        return this.model.mutex.exec(() => this._toggleArchive(true));
    }

    /**
     * @param {string} fieldName
     */
    getFieldDomain(fieldName) {
        const { domain } = this.fields[fieldName];
        return domain ? new Domain(domain).toList(this.evalContext) : [];
    }

    /**
     * @param {string} fieldName
     */
    isFieldInvalid(fieldName) {
        return this._invalidFields.has(fieldName);
    }

    update(changes) {
        if (this.model._urgentSave) {
            return this._update(changes);
        }
        return this.model.mutex.exec(() => this._update(changes));
    }

    async checkValidity() {
        if (!this._urgentSave) {
            await this._askChanges();
        }
        return this._checkValidity();
    }

    delete() {
        return this.model.mutex.exec(async () => {
            const unlinked = await this.model.orm.unlink(this.resModel, [this.resId], {
                context: this.context,
            });
            if (!unlinked) {
                return false;
            }
            const resIds = this.resIds.slice();
            const index = resIds.indexOf(this.resId);
            resIds.splice(index, 1);
            const resId = resIds[Math.min(index, resIds.length - 1)] || false;
            if (resId) {
                await this._load({ resId, resIds });
            } else {
                this.model._updateConfig(this.config, { resId: false }, { noReload: true });
                this.dirty = false;
                this._changes = this._parseServerValues(this._getDefaultValues());
                this._values = {};
                this.data = { ...this._changes };
                this._setDataContext();
            }
        });
    }

    discard() {
        return this.model.mutex.exec(() => this._discard());
    }

    duplicate() {
        return this.model.mutex.exec(async () => {
            const kwargs = { context: this.context };
            const index = this.resIds.indexOf(this.resId);
            const resId = await this.model.orm.call(this.resModel, "copy", [this.resId], kwargs);
            const resIds = this.resIds.slice();
            resIds.splice(index + 1, 0, resId);
            await this._load({ resId, resIds, mode: "edit" });
        });
    }

    async isDirty() {
        await this._askChanges();
        return this.dirty;
    }

    load(resId = this.resId, context = this.context) {
        let mode = this.config.mode;
        if (!resId) {
            mode = "edit";
        }
        return this.model.mutex.exec(() => this._load({ resId, mode, context }));
    }

    // FIXME: a single usecase, challenge the API (add an option to checkValidity?)
    openInvalidFieldsNotification() {
        if (this._invalidFields.size) {
            const items = [...this._invalidFields].map((fieldName) => {
                return `<li>${escape(this.fields[fieldName].string || fieldName)}</li>`;
            }, this);
            this._closeInvalidFieldsNotification = this.model.notification.add(
                markup(`<ul>${items.join("")}</ul>`),
                {
                    title: _t("Invalid fields: "),
                    type: "danger",
                }
            );
        }
    }

    async save(options) {
        await this._askChanges();
        return this.model.mutex.exec(() => this._save(options));
    }

    async setInvalidField(fieldName) {
        this.dirty = true;
        return this._setInvalidField(fieldName);
    }

    toggleSelection(selected) {
        if (typeof selected === "boolean") {
            this.selected = selected;
        } else {
            this.selected = !this.selected;
        }
    }

    unarchive() {
        return this.model.mutex.exec(() => this._toggleArchive(false));
    }

    // FIXME: should this be save({ urgent: true }) ?
    urgentSave() {
        this.model._urgentSave = true;
        this.model.bus.trigger("WILL_SAVE_URGENTLY");
        this._save({ noReload: true });
        return this.isValid;
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    _addSavePoint() {
        this._savePoint.dirty = this.dirty;
        Object.assign(this._savePoint.changes, this._changes);
        for (const fieldName in this._changes) {
            if (["one2many", "many2many"].includes(this.fields[fieldName].type)) {
                this._changes[fieldName]._addSavePoint();
            }
        }
    }

    _applyChanges(changes) {
        for (const fieldName in changes) {
            this._changes[fieldName] = changes[fieldName];
            this.data[fieldName] = changes[fieldName];
        }
        this._setDataContext();
        this._removeInvalidFields(Object.keys(changes));
    }

    _applyDefaultValues() {
        const fieldNames = this.fieldNames.filter((fieldName) => {
            return !(fieldName in this.data);
        });
        const defaultValues = this._getDefaultValues(fieldNames);
        if (this.isNew) {
            this._applyChanges(this._parseServerValues(defaultValues));
        } else {
            this._applyValues(defaultValues);
        }
    }

    _applyValues(values) {
        Object.assign(this._values, this._parseServerValues(values));
        Object.assign(this.data, this._values, this._changes);
        this._setDataContext();
    }

    _parseServerValues(serverValues, currentValues = {}) {
        const parsedValues = {};
        if (!serverValues) {
            return parsedValues;
        }
        for (const fieldName in serverValues) {
            const value = serverValues[fieldName];
            if (!this.activeFields[fieldName]) {
                continue;
            }
            const field = this.fields[fieldName];
            if (field.type === "one2many" || field.type === "many2many") {
                let staticList = currentValues[fieldName];
                let valueIsCommandList = true;
                // value can be a list of records or a list of commands (new record)
                valueIsCommandList = value.length > 0 && Array.isArray(value[0]);
                if (!staticList) {
                    let data = valueIsCommandList ? [] : value;
                    // FIXME: tocheck: what does unity return when no related field? In the mockServer, we return the list of ids
                    if (data.length > 0 && typeof data[0] === "number") {
                        data = data.map((resId) => {
                            return { id: resId };
                        });
                    }
                    staticList = this._createStaticListDatapoint(data, fieldName);
                }
                if (valueIsCommandList) {
                    staticList._applyCommands(value);
                }
                parsedValues[fieldName] = staticList;
            } else {
                parsedValues[fieldName] = parseServerValue(field, value);
                if (field.type === "properties") {
                    for (const property of parsedValues[fieldName]) {
                        const fieldPropertyName = `${fieldName}.${property.name}`;
                        if (property.type === "one2many" || property.type === "many2many") {
                            const staticList = this._createStaticListDatapoint(
                                property.value.map((record) => ({
                                    id: record[0],
                                    display_name: record[1],
                                })),
                                fieldPropertyName
                            );
                            parsedValues[fieldPropertyName] = staticList;
                        } else if (property.type === "many2one") {
                            parsedValues[fieldPropertyName] =
                                property.value.length && property.value[1] === null
                                    ? [property.value[0], this.model.env._t("No Access")]
                                    : property.value;
                        } else {
                            parsedValues[fieldPropertyName] = property.value ?? false;
                        }
                    }
                }
            }
        }
        return parsedValues;
    }

    // FIXME: move to model?
    _askChanges() {
        const proms = [];
        this.model.bus.trigger("NEED_LOCAL_CHANGES", { proms });
        return Promise.all(proms);
    }

    _checkValidity({ silent } = {}) {
        const unsetRequiredFields = [];
        for (const fieldName in this.activeFields) {
            const fieldType = this.fields[fieldName].type;
            if (this._isInvisible(fieldName)) {
                continue;
            }
            switch (fieldType) {
                case "boolean":
                case "float":
                case "integer":
                case "monetary":
                    continue;
                case "one2many":
                case "many2many": {
                    const list = this.data[fieldName];
                    if (
                        (this._isRequired(fieldName) && !list.count) ||
                        !list.records.every((r) => !r.dirty || r._checkValidity({ silent }))
                    ) {
                        unsetRequiredFields.push(fieldName);
                    }
                    break;
                }
                default:
                    if (!this.data[fieldName] && this._isRequired(fieldName)) {
                        unsetRequiredFields.push(fieldName);
                    }
            }
        }

        if (silent) {
            return !unsetRequiredFields.length;
        }

        for (const fieldName of Array.from(this._unsetRequiredFields)) {
            this._invalidFields.delete(fieldName);
        }
        this._unsetRequiredFields.clear();
        for (const fieldName of unsetRequiredFields) {
            this._unsetRequiredFields.add(fieldName);
            this._setInvalidField(fieldName);
        }
        return !this._invalidFields.size;
    }

    _createStaticListDatapoint(data, fieldName) {
        const { related, limit, defaultOrderBy } = this.activeFields[fieldName];
        // FIXME: generate the config in relational model ?
        const config = {
            // FIXME: can't do that here, no context... yes, we do, but need to pass rawContext
            resModel: this.fields[fieldName].relation,
            activeFields: (related && related.activeFields) || {},
            fields: (related && related.fields) || {},
            relationField: this.fields[fieldName].relation_field || false,
            offset: 0,
            resIds: data.map((r) => r.id),
            orderBy: defaultOrderBy || [],
            limit: limit || Number.MAX_SAFE_INTEGER,
            context: {},
        };
        let staticList;
        const options = {
            onChange: ({ withoutOnchange } = {}) =>
                this._update({ [fieldName]: staticList }, { withoutOnchange }),
            parent: this,
        };
        staticList = new this.model.constructor.StaticList(this.model, config, data, options);
        return staticList;
    }

    _discard() {
        for (const fieldName in this._changes) {
            if (["one2many", "many2many"].includes(this.fields[fieldName].type)) {
                this._changes[fieldName]._discard();
            }
        }
        this.dirty = this._savePoint.dirty;
        this._changes = { ...this._savePoint.changes };
        this.data = { ...this._values, ...this._changes };
        this._setDataContext();
        this._invalidFields.clear();
        this._closeInvalidFieldsNotification();
        this._closeInvalidFieldsNotification = () => {};
    }

    _formatServerValue(fieldType, value) {
        if (fieldType === "date") {
            return value ? serializeDate(value) : false;
        } else if (fieldType === "datetime") {
            return value ? serializeDateTime(value) : false;
        } else if (fieldType === "char" || fieldType === "text") {
            return value !== "" ? value : false;
        } else if (fieldType === "many2one") {
            return value ? value[0] : false;
        } else if (fieldType === "reference") {
            return value && value.resModel && value.resId
                ? `${value.resModel},${value.resId}`
                : false;
        } else if (fieldType === "properties") {
            return value.map((property) => {
                let value;
                if (property.type === "many2one") {
                    value = property.value;
                } else if (
                    (property.type === "date" || property.type === "datetime") &&
                    typeof property.value === "string"
                ) {
                    // TO REMOVE: need refactoring PropertyField to use the same format as the server
                    value = property.value;
                } else {
                    value = this._formatServerValue(property.type, property.value);
                }
                return {
                    ...property,
                    value,
                };
            });
        }
        return value;
    }

    _getChanges(changes = this._changes, { withReadonly } = {}) {
        const result = {};
        for (const [fieldName, value] of Object.entries(changes)) {
            const field = this.fields[fieldName];
            if (fieldName === "id") {
                continue;
            }
            if (
                !withReadonly &&
                fieldName in this.activeFields &&
                this._isReadonly(fieldName) &&
                !this.activeFields[fieldName].forceSave
            ) {
                continue;
            }
            if (field.relatedPropertyField) {
                continue;
            }
            if (field.type === "one2many" || field.type === "many2many") {
                const commands = value._getCommands({ withReadonly });
                if (commands.length) {
                    result[fieldName] = commands;
                }
            } else {
                result[fieldName] = this._formatServerValue(field.type, value);
            }
        }
        return result;
    }

    _getDefaultValues(fieldNames = this.fieldNames) {
        const defaultValues = {};
        for (const fieldName of fieldNames) {
            const field = this.fields[fieldName];
            if (isNumeric(field) && fieldName !== "id") {
                defaultValues[fieldName] = 0;
            } else if (isX2Many(field)) {
                defaultValues[fieldName] = [];
            } else {
                defaultValues[fieldName] = false;
            }
        }
        return defaultValues;
    }

    _computeDataContext() {
        const dataContext = {};
        const data = toRaw(this.data);
        for (const fieldName in data) {
            const value = data[fieldName];
            const field = this.fields[fieldName];
            if (["char", "text"].includes(field.type)) {
                dataContext[fieldName] = value !== "" ? value : false;
            } else if (["one2many", "many2many"].includes(field.type)) {
                dataContext[fieldName] = value.resIds;
            } else if (value && field.type === "date") {
                dataContext[fieldName] = serializeDate(value);
            } else if (value && field.type === "datetime") {
                dataContext[fieldName] = serializeDateTime(value);
            } else if (value && field.type === "many2one") {
                dataContext[fieldName] = value[0];
            } else if (value && field.type === "reference") {
                dataContext[fieldName] = `${value.resModel},${value.resId}`;
            } else if (field.type === "properties") {
                dataContext[fieldName] = value.filter(
                    (property) => !property.definition_deleted !== false
                );
            } else {
                dataContext[fieldName] = value;
            }
        }
        dataContext.id = this.resId || false;
        return dataContext;
    }

    _isInvisible(fieldName) {
        const invisible = this.activeFields[fieldName].invisible;
        return invisible ? evalDomain(invisible, this.evalContext) : false;
    }

    _isReadonly(fieldName) {
        const readonly = this.activeFields[fieldName].readonly;
        return readonly ? evalDomain(readonly, this.evalContext) : false;
    }

    _isRequired(fieldName) {
        const required = this.activeFields[fieldName].required;
        return required ? evalDomain(required, this.evalContext) : false;
    }

    async _load(nextConfig = {}) {
        // FIXME: do not allow to change resId? maybe add a new method on model to re-generate a
        // new root for the new resId
        const values = await this.model._updateConfig(this.config, nextConfig);
        if (this.resId) {
            this.model._updateSimilarRecords(this, values);
            this._values = this._parseServerValues(values);
            this._changes = {};
        } else {
            this._values = {};
            this._changes = this._parseServerValues({ ...this._getDefaultValues(), ...values });
        }
        this.dirty = false;
        this.data = { ...this._values, ...this._changes };
        this._setDataContext();
        this._invalidFields.clear();
    }

    async _preprocessChanges(changes) {
        await Promise.all([
            this._preprocessMany2oneChanges(changes),
            this._preprocessReferenceChanges(changes),
        ]);
    }

    async _preprocessReferenceChanges(changes) {
        const proms = [];
        for (const [fieldName, value] of Object.entries(changes)) {
            if (this.fields[fieldName].type !== "reference") {
                continue;
            }
            if (!value) {
                changes[fieldName] = false;
                continue;
            }
            const id = value.resId;
            const displayName = value.displayName;
            if (!id && !displayName) {
                changes[fieldName] = false;
                continue;
            }
            const context = getFieldContext(this, fieldName);

            if (!id && displayName !== undefined) {
                proms.push(
                    this.model.orm
                        .call(value.resModel, "name_create", [displayName], {
                            context,
                        })
                        .then((result) => {
                            changes[fieldName] = result
                                ? {
                                      resModel: value.resModel,
                                      resId: result[0],
                                      displayName,
                                  }
                                : false;
                        })
                );
            } else if (id && displayName === undefined) {
                const kwargs = {
                    context,
                    specification: { display_name: {} },
                };
                proms.push(
                    this.model.orm
                        .call(value.resModel, "web_read", [[id]], kwargs)
                        .then((records) => {
                            changes[fieldName] = {
                                resModel: value.resModel,
                                resId: id,
                                displayName: records[0].display_name,
                            };
                        })
                );
            } else {
                changes[fieldName] = value;
            }
        }
        return Promise.all(proms);
    }

    async _preprocessMany2oneChanges(changes) {
        const proms = [];
        for (const [fieldName, value] of Object.entries(changes)) {
            if (this.fields[fieldName].type !== "many2one") {
                continue;
            }
            if (!value) {
                changes[fieldName] = false;
                continue;
            }
            const [id, displayName] = value;
            if (!id && !displayName) {
                changes[fieldName] = [false, ""];
                continue;
            }

            const activeField = this.activeFields[fieldName];

            if (!activeField) {
                changes[fieldName] = value;
                continue;
            }

            const relation = this.fields[fieldName].relation;
            const context = getFieldContext(this, fieldName);

            if (!id && displayName !== undefined) {
                proms.push(
                    this.model.orm
                        .call(relation, "name_create", [displayName], {
                            context,
                        })
                        .then((result) => {
                            changes[fieldName] = result ? result : [false, ""];
                        })
                );
            } else if (id && displayName === undefined) {
                const kwargs = {
                    context,
                    specification: { display_name: {} },
                };
                proms.push(
                    this.model.orm.call(relation, "web_read", [[id]], kwargs).then((records) => {
                        changes[fieldName] = [records[0].id, records[0].display_name || ""];
                    })
                );
            } else {
                changes[fieldName] = value;
            }
        }
        return Promise.all(proms);
    }

    _removeInvalidFields(fieldNames) {
        for (const fieldName of fieldNames) {
            this._invalidFields.delete(fieldName);
        }
    }

    async _save({ noReload, onError } = {}) {
        // before saving, abandon new invalid, untouched records in x2manys
        for (const fieldName in this.activeFields) {
            if (["one2many", "many2many"].includes(this.fields[fieldName].type)) {
                this.data[fieldName]._abandonRecords();
            }
        }
        if (!this._checkValidity()) {
            this.openInvalidFieldsNotification();
            return false;
        }
        const changes = this._getChanges();
        const creation = !this.resId;
        delete changes.id; // id never changes, and should not be written
        if (!creation && !Object.keys(changes).length) {
            return true;
        }
        const canProceed = await this.model.hooks.onWillSaveRecord(this);
        if (canProceed === false) {
            return false;
        }
        const kwargs = { context: this.context };
        let resId = this.resId;
        try {
            if (creation) {
                [resId] = await this.model.orm.create(this.resModel, [changes], kwargs);
            } else {
                await this.model.orm.write(this.resModel, [resId], changes, kwargs);
            }
        } catch (e) {
            if (onError) {
                return onError(e, { discard: () => this._discard() });
            }
            if (!this.isInEdition) {
                await this._load({ resId });
            }
            throw e;
        }
        if (!noReload) {
            const nextConfig = { resId };
            if (creation) {
                nextConfig.resIds = this.resIds.concat([resId]);
            }
            await this._load(nextConfig);
        } else {
            this.model._updateConfig(this.config, { resId }, { noReload: true });
            this._values = { ...this._values, ...this._changes, id: resId };
            this._changes = {};
            this.data = { ...this._values };
            this.dirty = false;
        }
        await this.model.hooks.onRecordSaved(this);
        return true;
    }

    /**
     * For owl reactivity, it's better to only update the keys inside the evalContext
     * instead of replacing the evalContext itself, because a lot of components are
     * registered to the evalContext (but not necessarily keys inside it), and would
     * be uselessly re-rendered if we replace it by a brand new object.
     */
    _setDataContext() {
        Object.assign(this.evalContext, {
            ...this.context,
            active_id: this.resId || false,
            active_ids: this.resId ? [this.resId] : [],
            active_model: this.resModel,
            current_company_id: this.model.company.currentCompany.id,
            ...this._computeDataContext(),
        });

        for (const [fieldName, value] of Object.entries(toRaw(this.data))) {
            if (
                this.fields[fieldName].type === "one2many" ||
                this.fields[fieldName].type === "many2many"
            ) {
                value._updateContext(getFieldContext(this, fieldName));
            }
        }
    }

    async _setInvalidField(fieldName) {
        const canProceed = this.model.hooks.onWillSetInvalidField(this, fieldName);
        if (canProceed === false) {
            return;
        }
        if (this.selected && this.model.multiEdit && !this._invalidFields.has(fieldName)) {
            await this.model.dialog.add(AlertDialog, {
                body: _t("No valid record to save"),
                confirm: async () => {
                    await this.discard();
                    this._switchMode("readonly");
                },
            });
        }
        this._invalidFields.add(fieldName);
    }

    _switchMode(mode) {
        this.model._updateConfig(this.config, { mode }, { noReload: true });
        if (mode === "readonly") {
            this._invalidFields.clear();
        }
    }

    /**
     * @param {boolean} state archive the records if true, otherwise unarchive them
     */
    async _toggleArchive(state) {
        const method = state ? "action_archive" : "action_unarchive";
        const context = this.context;
        const resId = this.resId;
        const action = await this.model.orm.call(this.resModel, method, [[resId]], { context });
        if (action && Object.keys(action).length) {
            this.model.action.doAction(action, { onClose: () => this._load({ resId }) });
        } else {
            return this._load({ resId });
        }
    }

    async _update(changes, { withoutOnchange, withoutParentOnchange } = {}) {
        this.dirty = true;
        const prom = this._preprocessChanges(changes);
        if (prom && !this.model._urgentSave) {
            await prom;
        }
        if (this.selected && this.model.multiEdit) {
            this._applyChanges(changes);
            return this.model.root._multiSave(this);
        }
        for (const [fieldName, value] of Object.entries(changes)) {
            const field = this.fields[fieldName];
            if (field && field.relatedPropertyField) {
                const propertyFieldName = field.relatedPropertyField.fieldName;
                changes[propertyFieldName] = this.data[propertyFieldName].map((property) =>
                    property.name === field.propertyName ? { ...property, value } : property
                );
            }
        }
        const onChangeFields = Object.keys(changes).filter(
            (fieldName) => this.activeFields[fieldName] && this.activeFields[fieldName].onChange
        );
        if (onChangeFields.length && !this.model._urgentSave && !withoutOnchange) {
            const localChanges = this._getChanges(
                { ...this._changes, ...changes },
                { withReadonly: true }
            );
            if (this.config.relationField) {
                localChanges[this.config.relationField] = this._parentRecord._getChanges();
            }
            const otherChanges = await this.model._onchange(this.config, {
                changes: localChanges,
                fieldNames: onChangeFields,
                evalContext: this.evalContext,
            });
            Object.assign(changes, this._parseServerValues(otherChanges, this.data));
        }
        // changes inside the record set as value for a many2one field must trigger the onchange,
        // but can't be considered as changes on the parent record, so here we detect if many2one
        // fields really changed, and if not, we delete them from changes
        for (const fieldName in changes) {
            if (this.fields[fieldName].type === "many2one") {
                const curVal = toRaw(this.data[fieldName]);
                const nextVal = changes[fieldName];
                if (curVal && nextVal && curVal[0] === nextVal[0] && curVal[1] === nextVal[1]) {
                    delete changes[fieldName];
                }
            }
        }
        if (Object.keys(changes).length > 0) {
            this._applyChanges(changes);
            await this._onChange(changes, { withoutParentOnchange });
            return this.model.hooks.onRecordChanged(this, this._getChanges());
        }
    }
}
