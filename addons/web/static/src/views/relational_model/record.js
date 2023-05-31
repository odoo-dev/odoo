/* @odoo-module */

import { markup } from "@odoo/owl";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { makeContext } from "@web/core/context";
import { Domain } from "@web/core/domain";
import { serializeDate, serializeDateTime } from "@web/core/l10n/dates";
import { _t } from "@web/core/l10n/translation";
import { escape } from "@web/core/utils/strings";
import { evalDomain, isNumeric, isX2Many } from "@web/views/utils";
import { DataPoint } from "./datapoint";
import { getFieldContext, getFieldsSpec, parseServerValue } from "./utils";

export class Record extends DataPoint {
    static type = "Record";
    setup(config, data, options = {}) {
        this._parentRecord = options.parentRecord;
        this._onChange = options.onChange || (() => {});
        this.virtualId = options.virtualId || false;

        if (this.resId) {
            this._values = this._parseServerValues(data);
            this._changes = {};
        } else {
            this._values = this._parseServerValues({
                ...this._getDefaultValues(),
                ...data,
            });
            this._changes = { ...this._values };
        }
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
        this._setEvalContext();

        this._canNeverBeAbandoned = options.canNeverBeAbandoned === true;
        this.selected = false; // TODO: rename into isSelected?
        this.isDirty = false; // TODO: turn private? askChanges must be called beforehand to ensure the value is correct
        this._invalidFields = new Set();
        this._unsetRequiredFields = new Set();
        this._closeInvalidFieldsNotification = () => {};
    }

    // -------------------------------------------------------------------------
    // Getter
    // -------------------------------------------------------------------------

    get canBeAbandoned() {
        return this.isNew && !this.isDirty && !this._canNeverBeAbandoned;
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
                this.isDirty = false;
                this._changes = this._parseServerValues(this._getDefaultValues());
                this._values = {};
                this.data = { ...this._changes };
                this._setEvalContext();
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

    load(resId = this.resId, context = this.context) {
        let mode = this.config.mode;
        if (!resId) {
            mode = "edit";
        }
        return this.model.mutex.exec(() => this._load({ resId, mode, context }));
    }

    async save(options) {
        await this._askChanges();
        return this.model.mutex.exec(() => this._save(options));
    }

    async setInvalidField(fieldName) {
        const canProceed = this.model.hooks.onWillSetInvalidField(this, fieldName);
        if (canProceed === false) {
            return;
        }
        if (this.selected && this.model.multiEdit && !this._invalidFields.has(fieldName)) {
            await this.model.dialog.add(AlertDialog, {
                body: _t("No valid record to save"),
                confirm: async () => {
                    await this.discard();
                    this.model._updateConfig(this.config, { mode: "readonly" }, { noReload: true });
                },
            });
        }
        this._invalidFields.add(fieldName);
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

    _applyChanges(changes) {
        Object.assign(this._changes, changes);
        Object.assign(this.data, changes);
        this._setEvalContext();
        this._removeInvalidFields(Object.keys(changes));
    }

    _applyValues(values) {
        Object.assign(this._values, this._parseServerValues(values));
        Object.assign(this.data, this._values);
        this._setEvalContext();
    }

    _parseServerValues(serverValues, currentValues = {}) {
        const parsedValues = {};
        if (!serverValues) {
            return parsedValues;
        }
        for (const fieldName in serverValues) {
            if (!this.activeFields[fieldName]) {
                continue; // ignore fields not in activeFields
            }
            const value = serverValues[fieldName];
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

    _checkValidity() {
        for (const fieldName of Array.from(this._unsetRequiredFields)) {
            this._invalidFields.delete(fieldName);
        }
        this._unsetRequiredFields.clear();
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
                case "many2many":
                    if (
                        (this._isRequired(fieldName) && !this.data[fieldName].count) ||
                        !this._isX2ManyValid(fieldName)
                    ) {
                        this.setInvalidField(fieldName);
                        this._unsetRequiredFields.add(fieldName);
                    }
                    break;
                default:
                    if (!this.data[fieldName] && this._isRequired(fieldName)) {
                        this.setInvalidField(fieldName);
                        this._unsetRequiredFields.add(fieldName);
                    }
            }
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
            offset: 0,
            resIds: data.map((r) => r.id),
            orderBy: defaultOrderBy,
            limit,
            context: getFieldContext(this, fieldName),
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
        this.isDirty = false;
        for (const fieldName in this._changes) {
            if (["one2many", "many2many"].includes(this.fields[fieldName].type)) {
                this._changes[fieldName]._discard();
            }
        }
        this._changes = this.resId ? {} : { ...this.values };
        this.data = { ...this._values };
        this._setEvalContext();
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
                const commands = value._getCommands();
                if (commands.length) {
                    result[fieldName] = commands;
                }
            } else {
                result[fieldName] = this._formatServerValue(field.type, value);
            }
        }
        return result;
    }

    _getDefaultValues() {
        const defaultValues = {};
        for (const fieldName of this.fieldNames) {
            const field = this.fields[fieldName];
            if (isNumeric(field)) {
                defaultValues[fieldName] = 0;
            } else if (isX2Many(field)) {
                defaultValues[fieldName] = [];
            } else {
                defaultValues[fieldName] = false;
            }
        }
        return defaultValues;
    }

    _computeEvalContext() {
        const evalContext = {
            ...this.context,
            active_id: this.resId || false,
            active_ids: this.resId ? [this.resId] : [],
            active_model: this.resModel,
            current_company_id: this.model.company.currentCompany.id,
        };
        for (const fieldName in this.data) {
            const value = this.data[fieldName];
            const field = this.fields[fieldName];
            if (["char", "text"].includes(field.type)) {
                evalContext[fieldName] = value !== "" ? value : false;
            } else if (["one2many", "many2many"].includes(field.type)) {
                evalContext[fieldName] = value.resIds;
            } else if (value && field.type === "date") {
                evalContext[fieldName] = serializeDate(value);
            } else if (value && field.type === "datetime") {
                evalContext[fieldName] = serializeDateTime(value);
            } else if (value && field.type === "many2one") {
                evalContext[fieldName] = value[0];
            } else if (value && field.type === "reference") {
                evalContext[fieldName] = `${value.resModel},${value.resId}`;
            } else if (field.type === "properties") {
                evalContext[fieldName] = value.filter(
                    (property) => !property.definition_deleted !== false
                );
            } else {
                evalContext[fieldName] = value;
            }
        }
        evalContext.id = this.resId || false;
        return evalContext;
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

    _isX2ManyValid(fieldName) {
        return this.data[fieldName].records.every((r) => r._checkValidity());
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
        this.isDirty = false;
        this.data = { ...this._values, ...this._changes };
        this._setEvalContext();
        this._invalidFields.clear();
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
                        changes[fieldName] = [records[0].id, records[0].display_name];
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

    async _save({ noReload, force, onError } = {}) {
        if (!this.isDirty && !force) {
            return true;
        }
        // before saving, abandon new invalid, untouched records in x2manys
        for (const fieldName in this.activeFields) {
            if (["one2many", "many2many"].includes(this.fields[fieldName].type)) {
                this.data[fieldName]._abandonRecords();
            }
        }
        if (!this._checkValidity()) {
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
            this.isDirty = false;
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
    _setEvalContext() {
        Object.assign(this.evalContext, this._computeEvalContext());
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

    async _update(changes, { withoutOnchange } = {}) {
        this.isDirty = true;
        const prom = this._preprocessMany2oneChanges(changes);
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
            let context = this.context;
            if (onChangeFields.length === 1) {
                const fieldContext = this.activeFields[onChangeFields[0]].context;
                context = makeContext([context, fieldContext], this.evalContext);
            }
            const otherChanges = await this.model._onchange({
                resModel: this.resModel,
                resIds: this.resId ? [this.resId] : [],
                changes: this._getChanges({ ...this._changes, ...changes }),
                fieldNames: onChangeFields,
                spec: getFieldsSpec(this.activeFields, this.fields, this.evalContext),
                context,
            });
            Object.assign(changes, this._parseServerValues(otherChanges, this.data));
        }
        this._applyChanges(changes);
        await this._onChange();
        // FIXME: should we remove this from model? Only for standalone case
        this.model.bus.trigger("RELATIONAL_MODEL:RECORD_UPDATED", {
            record: this,
            changes: this._getChanges(),
        });
    }
}
