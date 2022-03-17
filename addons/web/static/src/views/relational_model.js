/* @odoo-module */

import { Commands, ORM } from "@web/core/orm_service";
import { Deferred, KeepLast, Mutex } from "@web/core/utils/concurrency";
import {
    deserializeDate,
    deserializeDateTime,
    serializeDate,
    serializeDateTime,
} from "@web/core/l10n/dates";
import { Dialog } from "@web/core/dialog/dialog";
import { Domain } from "@web/core/domain";
import { isNumeric, isRelational, isX2Many } from "@web/views/helpers/view_utils";
import { isTruthy } from "@web/core/utils/xml";
import { makeContext } from "@web/core/context";
import { Model } from "@web/views/helpers/model";
import { registry } from "@web/core/registry";
import { session } from "@web/session";

const { DateTime } = luxon;
const { markRaw, toRaw, xml } = owl;

const preloadedDataRegistry = registry.category("preloadedData");

const QUICK_CREATE_FIELD_TYPES = ["char", "boolean", "many2one", "selection"];
const DEFAULT_QUICK_CREATE_VIEW = {
    form: {
        // note: the required modifier is written in the format returned by the server
        arch: /* xml */ `
            <form>
                <field name="display_name" placeholder="Title" modifiers='{"required": true}' />
            </form>`,
        fields: {
            display_name: { string: "Display name", type: "char" },
        },
    },
};

class WarningDialog extends Dialog {
    setup() {
        super.setup();
        this.title = this.props.title;
    }
}
WarningDialog.bodyTemplate = xml`<t t-esc="props.message"/>`;

/**
 * @param {Object} groupByField
 * @returns {boolean}
 */
export const isAllowedDateField = (groupByField) => {
    return (
        ["date", "datetime"].includes(groupByField.type) &&
        isTruthy(groupByField.attrs.allow_group_range_value)
    );
};

/**
 * @typedef {Object} OrderTerm ?
 * @property {string} name
 * @property {boolean} asc
 */

/**
 * @param {OrderTerm[]} orderBy
 * @returns {string}
 */
function orderByToString(orderBy) {
    return orderBy.map((o) => `${o.name} ${o.asc ? "ASC" : "DESC"}`).join(", ");
}

/**
 * @param {any} string
 * @return {OrderTerm[]}
 */
export function stringToOrderBy(string) {
    if (!string) {
        return [];
    }
    return string.split(",").map((order) => {
        const splitOrder = order.trim().split(" ");
        if (splitOrder.length === 2) {
            return {
                name: splitOrder[0],
                asc: splitOrder[1].toLowerCase() === "asc",
            };
        } else {
            return {
                name: splitOrder[0],
                asc: true,
            };
        }
    });
}
/**
 * @param {any} modifier
 * @param {Object} evalContext
 * @returns {boolean}
 */
export function evalDomain(modifier, evalContext) {
    if (Array.isArray(modifier)) {
        modifier = new Domain(modifier).contains(evalContext);
    }
    return !!modifier;
}

/**
 * FIXME: don't know where this function should be:
 *   - on a dataPoint: don't want to make it accessible everywhere (e.g. in Fields)
 *   - on the model: would still be accessible by views + I like the current light API of the model
 *
 * Given a model name and res ids, calls the method "action_archive" or
 * "action_unarchive", and executes the returned action any.
 *
 * @param {string} resModel
 * @param {integer[]} resIds
 * @param {boolean} [unarchive=false] if true, unarchive the records, otherwise archive them
 */
async function archiveOrUnarchiveRecords(model, resModel, resIds, unarchive) {
    const method = unarchive === true ? "action_unarchive" : "action_archive";
    const action = await model.orm.call(resModel, method, [resIds]);
    if (action && Object.keys(action).length !== 0) {
        model.action.doAction(action);
    }
    //todo fge _invalidateCache
}

class RequestBatcherORM extends ORM {
    constructor() {
        super(...arguments);
        this.searchReadBatches = {};
        this.searchReadBatchId = 1;
        this.batches = {};
    }

    /**
     * @param {number[]} ids
     * @param {any[]} keys
     * @param {Function} callback
     * @returns {Promise<any>}
     */
    async batch(ids, keys, callback) {
        const key = JSON.stringify(keys);
        let batch = this.batches[key];
        if (!batch) {
            batch = {
                deferred: new Deferred(),
                scheduled: false,
                ids,
            };
            this.batches[key] = batch;
        }
        const previousIds = batch.ids;
        batch.ids = [...new Set([...previousIds, ...ids])];

        if (!batch.scheduled) {
            batch.scheduled = true;
            await Promise.resolve();
            delete this.batches[key];
            const result = await callback(batch.ids);
            batch.deferred.resolve(result);
        }

        return batch.deferred;
    }

    /**
     * Entry point to batch "name_get" calls. If the `resModel` argument has
     * already been called, the given ids are added to the previous list of ids
     * to perform a single name_get call.
     *
     * @param {string} resModel
     * @param {number[]} resIds
     * @param {object} context
     * @returns {Promise<[number, string][]>}
     */
    async nameGet(resModel, resIds, context) {
        const pairs = await this.batch(resIds, ["name_get", resModel, context], (resIds) =>
            super.nameGet(resModel, resIds, context)
        );
        return pairs.filter(([id]) => resIds.includes(id));
    }

    /**
     * Entry point to batch "read" calls. If the `fields` and `resModel`
     * arguments have already been called, the given ids are added to the
     * previous list of ids to perform a single read call. Once the server
     * responds, records are then dispatched to the callees based on the
     * given ids arguments (kept in the closure).
     *
     * @param {string} resModel
     * @param {number[]} resIds
     * @param {string[]} fields
     * @returns {Promise<Object[]>}
     */
    async read(resModel, resIds, fields, context) {
        const records = await this.batch(resIds, ["read", resModel, fields, context], (resIds) =>
            super.read(resModel, resIds, fields, context)
        );
        return records.filter((r) => resIds.includes(r.id));
    }

    /**
     * Entry point to batch "unlink" calls. If the `resModel` argument has
     * already been called, the given ids are added to the previous list of ids
     * to perform a single unlink call.
     *
     * @param {string} resModel
     * @param {number[]} resIds
     * @returns {Promise<boolean>}
     */
    async unlink(resModel, resIds, context) {
        return this.batch(resIds, ["unlink", resModel, context], (resIds) =>
            super.unlink(resModel, resIds, context)
        );
    }

    /**
     * @override
     */
    async webSearchRead(/*model*/) {
        // FIXME: discriminate on model? (it is always the same in our usecase)
        const batchId = this.searchReadBatchId;
        let batch = this.searchReadBatches[batchId];
        if (!batch) {
            batch = {
                deferred: new Deferred(),
                count: 0,
            };
            Promise.resolve().then(() => this.searchReadBatchId++);
            this.searchReadBatches[batchId] = batch;
        }
        batch.count++;
        const result = await super.webSearchRead(...arguments);
        batch.count--;
        if (batch.count === 0) {
            delete this.searchReadBatches[batchId];
            batch.deferred.resolve();
        }
        await batch.deferred;
        return result;
    }
}

let nextId = 0;
class DataPoint {
    /**
     * @param {RelationalModel} model
     * @param {Object} [params={}]
     * @param {Object} [state={}]
     */
    constructor(model, params = {}, state = {}) {
        this.id = `datapoint_${nextId++}`;

        this.model = model;
        this.resModel = params.resModel;
        this.fields = params.fields;
        this.activeFields = params.activeFields;
        this.context = params.context;

        this.setup(params, state);
    }

    get fieldNames() {
        return Object.keys(this.activeFields);
    }

    /**
     * @abstract
     * @param {Object} params
     * @param {Object} state
     */
    setup() {}

    exportState() {
        return {};
    }

    async load() {
        throw new Error("load must be implemented");
    }

    _parseServerValue(field, value) {
        switch (field.type) {
            case "char": {
                return value || "";
            }
            case "date": {
                return value ? deserializeDate(value) : false;
            }
            case "datetime": {
                return value ? deserializeDateTime(value) : false;
            }
            case "selection": {
                if (value === false) {
                    // process selection: convert false to 0, if 0 is a valid key
                    const hasKey0 = field.selection.find((option) => option[0] === 0);
                    return hasKey0 ? 0 : value;
                }
                break;
            }
        }
        return value;
    }

    _parseServerValues(values) {
        const parsedValues = {};
        if (!values) {
            return parsedValues;
        }
        for (const fieldName in values) {
            const value = values[fieldName];
            const field = this.fields[fieldName];
            parsedValues[fieldName] = this._parseServerValue(field, value);
        }
        return parsedValues;
    }
}

export class Record extends DataPoint {
    setup(params, state) {
        if ("resId" in params) {
            this.resId = params.resId;
        } else if (state) {
            this.resId = state.resId;
        }
        if (!this.resId) {
            this.resId = false;
            this.virtualId = this.model.nextVirtualId;
        }
        this.resIds =
            (params.resIds ? toRaw(params.resIds) : null) || // FIXME WOWL reactivity
            state.resIds ||
            (this.resId ? [this.resId] : []);

        this.parentActiveFields = params.parentActiveFields || false;
        this.onChanges = params.onChanges || (() => {});

        this._values = params.values;
        this._changes = params.changes || {};
        this.data = { ...this._values, ...this._changes };
        this._invalidFields = new Set();
        this._requiredFields = new Set();
        this.preloadedData = {};
        this.preloadedDataCaches = {};
        this.selected = false;
        this.isInQuickCreation = params.isInQuickCreation || false;
        this._onChangePromise = Promise.resolve({});
        this._domains = {};

        this.mode = params.mode || (this.resId ? state.mode || "readonly" : "edit");
        this._onWillSwitchMode = params.onRecordWillSwitchMode || (() => {});
        markRaw(this);

        this.setRequiredFields();
    }

    get evalContext() {
        const evalContext = {};
        for (const fieldName in this.activeFields) {
            const value = this.data[fieldName];
            if ([null].includes(value)) {
                evalContext[fieldName] = false;
            } else if (isX2Many(this.fields[fieldName])) {
                if (!value || Array.isArray(value)) {
                    // no dataPoint created yet
                    evalContext[fieldName] = value ? [...value] : [];
                } else {
                    evalContext[fieldName] = value.records.map((r) => r.resId);
                }
            } else if (value && this.fields[fieldName].type === "date") {
                evalContext[fieldName] = value.toFormat("yyyy-LL-dd");
            } else if (value && this.fields[fieldName].type === "datetime") {
                evalContext[fieldName] = value.toFormat("yyyy-LL-dd HH:mm:ss");
            } else {
                evalContext[fieldName] = value;
            }
        }
        return evalContext;
    }

    get isDirty() {
        // to change (call isDirty on x2many children...)
        return Object.keys(this._changes).length > 0;
    }

    /**
     * Since the ORM can support both `active` and `x_active` fields for
     * the archiving mechanism, check if any such field exists and prioritize
     * them. The `active` field should always take priority over its custom
     * version.
     *
     * @returns {boolean} true iff the field is active or there is no `active`
     *   or `x_active` field on the model
     */
    get isActive() {
        if ("active" in this.activeFields) {
            return this.data.active;
        } else if ("x_active" in this.activeFields) {
            return this.data.x_active;
        }
        return true;
    }

    get isVirtual() {
        return !this.resId;
    }

    get isInEdition() {
        return this.mode === "edit";
    }

    /**
     * @param {"edit" | "readonly"} mode
     * @returns {Promise<void>}
     */
    async switchMode(mode) {
        if (this.mode === mode) {
            return;
        }
        await this._onWillSwitchMode(this, mode);
        if (mode === "readonly") {
            for (const fieldName in this.activeFields) {
                if (["one2many", "many2many"].includes(this.fields[fieldName].type)) {
                    const editedRecord = this.data[fieldName] && this.data[fieldName].editedRecord;
                    if (editedRecord) {
                        editedRecord.switchMode("readonly");
                    }
                }
            }
        }
        this.mode = mode;
        this.model.notify();
    }

    /**
     * FIXME: memoize this at some point?
     * @param {string} fieldName
     * @returns {boolean}
     */
    isReadonly(fieldName) {
        const { readonly } = this.activeFields[fieldName].modifiers;
        return evalDomain(readonly, this.evalContext);
    }

    setRequiredFields() {
        for (const fieldName in this.activeFields) {
            const field = this.activeFields[fieldName];
            if (field.required) {
                this._requiredFields.add({ fieldName });
            }
            if (field.modifiers && field.modifiers.required) {
                this._requiredFields.add({
                    fieldName,
                    modifier:
                        typeof field.modifiers.required !== "boolean" && field.modifiers.required,
                });
            }
        }
    }

    /**
     * FIXME: memoize this at some point?
     * @param {string} fieldName
     * @returns {boolean}
     */
    isRequired(fieldName) {
        for (const required of this._requiredFields) {
            if (required.fieldName === fieldName) {
                if (required.modifier) {
                    return evalDomain(required.modifier, this.evalContext);
                }
                return true;
            }
        }
        return false;
    }

    /**
     * FIXME: memoize this at some point?
     * @param {string} fieldName
     * @returns {boolean}
     */
    isInvisible(fieldName) {
        if (!this.activeFields[fieldName].modifiers) {
            return false;
        }
        const { invisible } = this.activeFields[fieldName].modifiers;
        if (typeof invisible === "boolean") {
            return invisible;
        } else if (!invisible) {
            return false;
        } else {
            return evalDomain(invisible, this.evalContext);
        }
    }

    setInvalidField(fieldName) {
        this._invalidFields.add({ fieldName });
        this.model.notify();
    }

    isInvalid(fieldName) {
        for (const invalid of this._invalidFields) {
            if (invalid.fieldName === fieldName) return true;
        }
        return false;
    }

    async load() {
        if (!this.fieldNames.length) {
            return;
        }
        let data;
        if (this.isVirtual) {
            const onchangeValues = await this._performOnchange();
            data = {
                ...this._generateDefaultValues(),
                ...onchangeValues,
            };
        } else {
            data = await this._read();
            this._changes = {};
        }
        this._values = data; // FIXME: don't update internal state directly
        this.data = { ...data };
        this._invalidFields = new Set();

        // Relational data
        await this.loadRelationalData();
        await this.loadPreloadedData();
    }

    exportState() {
        return {
            mode: this.mode,
            resId: this.resId,
            resIds: this.resIds,
        };
    }

    getFieldContext(fieldName) {
        return makeContext([this.context, this.activeFields[fieldName].context], this.evalContext);
    }

    getFieldDomain(fieldName) {
        return Domain.and([
            this._domains[fieldName] || [],
            this.activeFields[fieldName].domain || [],
        ]);
    }

    loadPreloadedData() {
        const fetchPreloadedData = async (fetchFn, fieldName) => {
            const domain = this.getFieldDomain(fieldName).toList(this.evalContext).toString();
            if (this.preloadedDataCaches[fieldName] !== domain) {
                this.preloadedDataCaches[fieldName] = domain;
                this.preloadedData[fieldName] = await fetchFn(this.model.orm, this, fieldName);
            }
        };

        const proms = [];
        for (const fieldName in this.activeFields) {
            const activeField = this.activeFields[fieldName];
            // @FIXME type should not be get like this
            const type = activeField.widget || this.fields[fieldName].type;
            if (!this.isInvisible(fieldName) && preloadedDataRegistry.contains(type)) {
                proms.push(fetchPreloadedData(preloadedDataRegistry.get(type), fieldName));
            }
        }
        return Promise.all(proms);
    }

    async loadRelationalData() {
        const proms = [];
        for (const fieldName in this.activeFields) {
            if (this.fields[fieldName].type === "many2one") {
                proms.push(
                    this._loadOne2ManyData(fieldName, this.data[fieldName]).then((value) => {
                        this.data[fieldName] = value;
                        this._values[fieldName] = value;
                    })
                );
            } else if (isX2Many(this.fields[fieldName])) {
                proms.push(this._loadX2ManyData(fieldName));
            }
        }
        return Promise.all(proms);
    }

    async update(fieldName, value) {
        this.onChanges();
        await this._applyChange(fieldName, value);
        const activeField = this.activeFields[fieldName];
        if (activeField && activeField.onChange) {
            await this._performOnchange(fieldName);
        }
        await this.loadPreloadedData();
        this._invalidFields.forEach((x) =>
            x.fieldName === fieldName ? this._invalidFields.delete(x) : x
        );
        this.model.notify();
    }

    /**
     *
     * @param {Object} options
     * @param {boolean} [options.stayInEdition=false]
     * @param {boolean} [options.noReload=false] prevents the record from
     *  reloading after changes are applied, typically used to defer the load.
     * @returns {Promise<boolean>}
     */
    async save(options = { stayInEdition: false, noReload: false }) {
        return this.model.mutex.exec(async () => {
            if (this._requiredFields.size > 0) {
                let requiredStringArr = [];
                for (const required of this._requiredFields) {
                    if (
                        typeof this.data[required.fieldName] === "number" ||
                        this.data[required.fieldName] ||
                        (required.modifier && !evalDomain(required.modifier, this.evalContext))
                    ) {
                        continue;
                    }
                    this.setInvalidField(required.fieldName);
                    // TODO only add debugMessage if debug mode is active.
                    if (required.debugMessage) {
                        requiredStringArr.push(required.fieldName + ":" + required.debugMessage);
                    } else {
                        requiredStringArr.push(required.fieldName);
                    }
                }
                if (requiredStringArr.length > 0) {
                    this.model.notificationService.add(requiredStringArr.join(", "), {
                        title: this.model.env._t("Required fields: "),
                        type: "danger",
                    });
                    return false;
                }
            }
            if (this._invalidFields.size > 0) {
                let invalidStringArr = [];
                for (const invalid of this._invalidFields) {
                    // TODO only add debugMessage if debug mode is active.
                    if (invalid.debugMessage) {
                        invalidStringArr.push(invalid.fieldName + ":" + invalid.debugMessage);
                    } else {
                        invalidStringArr.push(invalid.fieldName);
                    }
                }
                this.model.notificationService.add(invalidStringArr.join(", "), {
                    title: this.model.env._t("Invalid fields: "),
                    type: "danger",
                });
                return false;
            }
            const changes = this.getChanges();
            const keys = Object.keys(changes);
            const hasChanges = this.isVirtual || keys.length;
            const shouldReload = hasChanges ? !options.noReload : false;
            if (this.isVirtual) {
                if (keys.length === 1 && keys[0] === "display_name") {
                    const [resId] = await this.model.orm.call(
                        this.resModel,
                        "name_create",
                        [changes.display_name],
                        { context: this.context }
                    );
                    this.resId = resId;
                } else {
                    this.resId = await this.model.orm.create(this.resModel, changes, this.context);
                }
                this.resIds.push(this.resId);
            } else if (keys.length > 0) {
                await this.model.orm.write(this.resModel, [this.resId], changes);
            }
            // Switch to the parent active fields
            if (this.parentActiveFields) {
                this.activeFields = this.parentActiveFields;
                this.parentActiveFields = false;
            }
            this.isInQuickCreation = false;
            if (shouldReload) {
                this.model.trigger("record-updated", { record: this });
                await this.load();
                this.model.notify();
            }
            if (!options.stayInEdition) {
                this.switchMode("readonly");
            }
            return true;
        });
    }

    async archive() {
        await archiveOrUnarchiveRecords(this.model, this.resModel, [this.resId]);
        await this.load();
        this.model.notify();
    }

    async unarchive() {
        await archiveOrUnarchiveRecords(this.model, this.resModel, [this.resId], true);
        await this.load();
        this.model.notify();
    }

    // FIXME AAB: to discuss: not sure we want to keep resIds in the model (this concerns
    // "duplicate" and "delete"). Alternative: handle this in form_view (but then what's the
    // point of calling a Record method to do the operation?)
    async duplicate() {
        const kwargs = { context: this.context };
        const index = this.resIds.indexOf(this.resId);
        this.resId = await this.model.orm.call(this.resModel, "copy", [this.resId], kwargs);
        this.resIds.splice(index + 1, 0, this.resId);
        await this.load();
        this.switchMode("edit");
        this.model.notify();
    }

    async delete() {
        const unlinked = await this.model.orm.unlink(this.resModel, [this.resId], this.context);
        if (!unlinked) {
            return false;
        }
        const index = this.resIds.indexOf(this.resId);
        this.resIds.splice(index, 1);
        this.resId = this.resIds[Math.min(index, this.resIds.length - 1)] || false;
        if (this.resId) {
            await this.load();
            this.model.notify();
        } else {
            this.data = {};
            this._values = {};
            this._changes = {};
            this.preloadedData = {};
        }
    }

    toggleSelection(selected) {
        if (typeof selected === "boolean") {
            this.selected = selected;
        } else {
            this.selected = !this.selected;
        }
        this.model.notify();
    }

    discard() {
        for (const fieldName in this.activeFields) {
            // activeFields should be changes
            if (["one2many", "many2many"].includes(this.fields[fieldName].type)) {
                this.data[fieldName].discard();
            }
        }
        this.data = { ...this._values };
        this._changes = {};
        this._domains = {};
        if (!this.isVirtual) {
            this.switchMode("readonly");
        }
        this.model.notify();
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    async _loadOne2ManyData(fieldName, value) {
        const relation = this.fields[fieldName].relation;
        const field = this.activeFields[fieldName];
        if (
            this.fieldNames.includes(fieldName) &&
            !this.isInvisible(fieldName) &&
            value &&
            (!value[1] || field.options.always_reload)
        ) {
            const context = this.getFieldContext(fieldName);
            const result = await this.model.orm.nameGet(relation, [value[0]], context);
            return result[0];
        }
        return value;
    }

    _loadX2ManyData(fieldName) {
        const field = this.activeFields[fieldName];
        const { relatedFields = {}, views = {}, viewMode, FieldComponent } = field;

        const fields = {
            id: { name: "id", type: "integer", readonly: true },
            ...relatedFields,
            ...FieldComponent.fieldsToFetch,
        };
        const activeFields =
            (views[viewMode] && views[viewMode].activeFields) || FieldComponent.fieldsToFetch || {};
        for (const fieldName in relatedFields) {
            if (relatedFields[fieldName].active) {
                activeFields[fieldName] = relatedFields[fieldName];
            }
        }
        const limit = views[viewMode] && views[viewMode].limit;
        const orderBy = views[viewMode] && views[viewMode].defaultOrder;
        const list = this.model.createDataPoint("list", {
            resModel: this.fields[fieldName].relation,
            fields,
            activeFields,
            context: this.context,
            rawContext: field.context,
            getEvalContext: () => this.evalContext,
            limit,
            orderBy,
            field: this.fields[fieldName],
            resIds: this.data[fieldName] || [],
            commands: this._changes[fieldName],
            views,
            viewMode,
            onChanges: () => {
                this.onChanges();
                this._changes[fieldName] = list;
            },
            onRecordWillSwitchMode: (record, mode) => {
                if (mode === "edit") {
                    this.switchMode("edit");
                }
            },
        });

        this._values[fieldName] = list;
        this.data[fieldName] = list;
        if (!this.isInvisible(fieldName)) {
            this._changes[fieldName] = list;
            return list.load();
        }
        return Promise.resolve();
    }

    async _read() {
        const result = await this.model.orm.read(this.resModel, [this.resId], this.fieldNames, {
            bin_size: true,
            ...this.context,
        });
        return this._parseServerValues(result[0]);
    }

    async _applyChange(fieldName, value) {
        const field = this.fields[fieldName];
        if (field && ["one2many", "many2many"].includes(field.type)) {
            await this.data[fieldName].update(value);
            this._changes[fieldName] = this.data[fieldName];
        } else {
            if (field && field.type === "many2one") {
                value = await this._loadOne2ManyData(fieldName, value);
            }
            this.data[fieldName] = value;
            this._changes[fieldName] = value;
        }
    }

    async _performOnchange(fieldName) {
        return this.model.mutex.exec(async () => {
            const result = await this.model.orm.call(
                this.resModel,
                "onchange",
                [[], this.getChanges(true), fieldName ? [fieldName] : [], this._getOnchangeSpec()],
                { context: this.context }
            );
            if (result.warning) {
                const { type, title, message } = result.warning;
                if (type === "dialog") {
                    this.model.dialogService.add(WarningDialog, { title, message });
                } else {
                    this.model.notificationService.add(message, {
                        className: result.warning.className,
                        sticky: result.warning.sticky,
                        title,
                        type: "warning",
                    });
                }
            }
            if (result.domain) {
                Object.assign(this._domains, result.domain);
            }
            for (const fieldName in result.value) {
                this._invalidFields.forEach((x) =>
                    x.fieldName === fieldName ? this._invalidFields.delete(x) : x
                );
                // for x2many fields, the onchange returns commands, not ids, so we need to process them
                // for now, we simply return an empty list
                if (isX2Many(this.fields[fieldName])) {
                    if (this.data[fieldName]) {
                        this.data[fieldName].applyCommands(result.value[fieldName]);
                        delete result.value[fieldName];
                    }
                }
            }
            const onChangeValues = this._parseServerValues(result.value);
            Object.assign(this.data, onChangeValues);
            Object.assign(this._changes, onChangeValues);
            return onChangeValues;
        });
    }

    _getOnchangeSpec() {
        const specs = {};
        function buildSpec(activeFields, prefix) {
            for (const fieldName in activeFields) {
                const activeField = activeFields[fieldName];
                const key = prefix ? `${prefix}.${fieldName}` : fieldName;
                specs[key] = activeField.onChange ? "1" : "";
                const subViewInfo = activeField.views && activeField.views[activeField.viewMode];
                if (subViewInfo) {
                    buildSpec(subViewInfo.activeFields, key);
                }
            }
        }
        buildSpec(this.activeFields);
        return specs;
    }

    getChanges(allFields = false) {
        const changes = { ...(allFields ? this.data : this._changes) };
        for (const fieldName in changes) {
            const fieldType = this.fields[fieldName].type;
            if (["one2many", "many2many"].includes(fieldType)) {
                changes[fieldName] = changes[fieldName].getCommands();
                if (!changes[fieldName]) {
                    delete changes[fieldName];
                }
            } else if (fieldType === "many2one") {
                changes[fieldName] = changes[fieldName] ? changes[fieldName][0] : false;
            } else if (fieldType === "date") {
                changes[fieldName] = changes[fieldName] ? serializeDate(changes[fieldName]) : false;
            } else if (fieldType === "datetime") {
                changes[fieldName] = changes[fieldName]
                    ? serializeDateTime(changes[fieldName])
                    : false;
            }
        }
        return changes;
    }

    _generateDefaultValues() {
        const defaultValues = {};
        for (const fieldName of this.fieldNames) {
            if (isNumeric(this.fields[fieldName])) {
                defaultValues[fieldName] = 0;
            } else {
                defaultValues[fieldName] = null;
            }
        }
        return defaultValues;
    }

    _sanitizeValues(values) {
        if (this.resModel !== this.model.resModel) {
            return values;
        }
        const sanitizedValues = {};
        for (const fieldName in values) {
            if (this.fields[fieldName].type === "char") {
                sanitizedValues[fieldName] = values[fieldName] || "";
            } else {
                sanitizedValues[fieldName] = values[fieldName];
            }
        }
        return sanitizedValues;
    }
}

class DynamicList extends DataPoint {
    setup(params, state) {
        this.groupBy = params.groupBy || [];
        this.domain = markRaw(params.domain || []);
        this.orderBy = params.orderBy || []; // rename orderBy + get back from state
        this.offset = 0;
        this.count = 0;
        this.limit = params.limit || state.limit || this.constructor.DEFAULT_LIMIT;
        this.isDomainSelected = false;

        this.editedRecord = null;
        this.onRecordWillSwitchMode = async (record, mode) => {
            const editedRecord = this.editedRecord;
            this.editedRecord = null;
            if (!params.onRecordWillSwitchMode && editedRecord) {
                // not really elegant, but we only need the root list to save the record
                await editedRecord.save();
            }
            if (mode === "edit") {
                this.editedRecord = record;
            }
            if (params.onRecordWillSwitchMode) {
                params.onRecordWillSwitchMode(record, mode);
            }
        };
    }

    get firstGroupBy() {
        return this.groupBy[0] || false;
    }

    get groupByField() {
        if (!this.firstGroupBy) {
            return false;
        }
        const [groupByFieldName] = this.firstGroupBy.split(":");
        return {
            attrs: {},
            ...this.fields[groupByFieldName],
            ...this.activeFields[groupByFieldName],
        };
    }

    get isM2MGrouped() {
        return this.groupBy.some((fieldName) => this.fields[fieldName].type === "many2many");
    }

    get selection() {
        return this.records.filter((r) => r.selected);
    }

    canQuickCreate() {
        return (
            this.groupByField &&
            this.model.onCreate === "quick_create" &&
            (isAllowedDateField(this.groupByField) ||
                QUICK_CREATE_FIELD_TYPES.includes(this.groupByField.type))
        );
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
                });
            } else {
                resIds = this.selection.map((r) => r.resId);
            }
        } else {
            resIds = this.records.map((r) => r.resId);
        }
        return resIds;
    }

    /**
     * @param {boolean} [isSelected]
     * @returns {Promise<number[]>}
     */
    async archive(isSelected) {
        const resIds = await this.getResIds(isSelected);
        await archiveOrUnarchiveRecords(this.model, this.resModel, resIds);
        await this.model.load();
        return resIds;
        //todo fge _invalidateCache
    }

    /**
     * @param {boolean} [isSelected]
     * @returns {Promise<number[]>}
     */
    async unarchive(isSelected) {
        const resIds = await this.getResIds(isSelected);
        await archiveOrUnarchiveRecords(this.model, this.resModel, resIds, true);
        await this.model.load();
        return resIds;
        //todo fge _invalidateCache
    }

    exportState() {
        return {
            limit: this.limit,
        };
    }

    selectDomain(value) {
        this.isDomainSelected = value;
        this.model.notify();
    }

    async sortBy(fieldName) {
        if (this.orderBy.length && this.orderBy[0].name === fieldName) {
            this.orderBy[0].asc = !this.orderBy[0].asc;
        } else {
            this.orderBy = this.orderBy.filter((o) => o.name !== fieldName);
            this.orderBy.unshift({
                name: fieldName,
                asc: true,
            });
        }

        await this.load();
        this.model.notify();
    }

    /**
     * Calls the method 'resequence' on the current resModel.
     * If 'movedId' is provided, the record matching that ID will be resequenced
     * in the current list of IDs, at the start of the list or after the record
     * matching 'targetId' if given as well.
     * @param {(Group | Record)[]} list
     * @param {string} idProperty property on the given list used to determine each ID
     * @param {string} [movedId]
     * @param {string} [targetId]
     * @returns {Promise<(Group | Record)[]>}
     */
    async _resequence(list, idProperty, movedId, targetId) {
        if (movedId) {
            const target = list.find((r) => r.id === movedId);
            const index = targetId ? list.findIndex((r) => r.id === targetId) : 0;
            list = list.filter((r) => r.id !== movedId);
            list.splice(index, 0, target);
        }
        const model = this.resModel;
        const ids = list.map((r) => r[idProperty]).filter(Boolean);
        // FIMME: can't go though orm, so no context given
        await this.model.rpc("/web/dataset/resequence", { model, ids });
        this.model.notify();
        return list;
    }
}

DynamicList.DEFAULT_LIMIT = 80;

export class DynamicRecordList extends DynamicList {
    setup(params) {
        super.setup(...arguments);

        /** @type {Record[]} */
        this.records = [];
        this.data = params.data;
    }

    get quickCreateRecord() {
        return this.records.find((r) => r.isInQuickCreation);
    }

    async load() {
        this.records = await this._loadRecords();
    }

    async resequence() {
        this.records = await this._resequence(this.records, "resId", ...arguments);
    }

    /**
     * @param {Object} [params={}]
     * @param {boolean} [atFirstPosition]
     * @returns {Promise<Record>} the newly created record
     */
    async createRecord(params = {}, atFirstPosition = false) {
        const newRecord = this.model.createDataPoint("record", {
            resModel: this.resModel,
            fields: this.fields,
            activeFields: this.activeFields,
            parentActiveFields: this.activeFields,
            onRecordWillSwitchMode: this.onRecordWillSwitchMode,
            ...params,
        });
        await newRecord.load();
        this.editedRecord = newRecord;
        return this.addRecord(newRecord, atFirstPosition ? 0 : this.count);
    }

    /**
     * @param {Record[]} [records=[]]
     * @returns {Promise<number[]>}
     */
    async deleteRecords(records = []) {
        let deleted = false;
        let resIds;
        if (records.length) {
            resIds = records.map((r) => r.resId);
        } else {
            resIds = await this.getResIds(true);
            records = this.records.filter((r) => resIds.includes(r.resId));
            if (this.isDomainSelected) {
                await this.model.orm.unlink(this.resModel, resIds, this.context);
                deleted = true;
            }
        }
        if (!deleted) {
            await Promise.all(records.map((record) => record.delete()));
        }
        for (const record of records) {
            this.removeRecord(record);
        }
        // Reload the model only if more records should appear on the current page.
        if (this.count && !this.records.length) {
            await this.model.load();
        }
        return resIds;
    }

    /**
     * @param {Record} record
     * @param {number} [index]
     * @returns {Record}
     */
    addRecord(record, index) {
        this.records.splice(Number.isInteger(index) ? index : this.records.length, 0, record);
        this.count++;
        this.model.notify();
        return record;
    }

    /**
     * @param {Record} record
     * @returns {Record}
     */
    removeRecord(record) {
        const index = this.records.findIndex((r) => r === record);
        this.records.splice(index, 1);
        this.count--;
        if (this.editedRecord === record) {
            this.editedRecord = null;
        }
        this.model.notify();
        return record;
    }

    async loadMore() {
        this.offset = this.records.length;
        const nextRecords = await this._loadRecords();
        for (const record of nextRecords) {
            this.addRecord(record);
        }
    }

    empty() {
        this.records = [];
        this.count = 0;
    }

    async cancelQuickCreate(force = false) {
        const record = this.quickCreateRecord;
        if (record && (force || !record.isDirty)) {
            this.removeRecord(record);
        }
    }

    async quickCreate(activeFields, context) {
        const record = this.quickCreateRecord;
        if (record) {
            this.removeRecord(record);
        }
        return this.createRecord({ activeFields, context, isInQuickCreation: true }, true);
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    async _loadRecords() {
        const order = orderByToString(this.orderBy);
        const { records: rawRecords, length } =
            this.data ||
            (await this.model.orm.webSearchRead(
                this.resModel,
                this.domain,
                this.fieldNames,
                {
                    limit: this.limit,
                    order,
                    offset: this.offset,
                },
                {
                    bin_size: true,
                    ...this.context,
                }
            ));

        const records = await Promise.all(
            rawRecords.map(async (data) => {
                data = this._parseServerValues(data);
                const record = this.model.createDataPoint("record", {
                    resModel: this.resModel,
                    resId: data.id,
                    values: data,
                    fields: this.fields,
                    activeFields: this.activeFields,
                    onRecordWillSwitchMode: this.onRecordWillSwitchMode,
                });
                await record.loadRelationalData();
                await record.loadPreloadedData();
                return record;
            })
        );

        delete this.data;
        this.count = length;

        return records;
    }
}

export class DynamicGroupList extends DynamicList {
    setup(params, state) {
        super.setup(...arguments);

        this.groupByInfo = params.groupByInfo || {}; // FIXME: is this something specific to the list view?
        this.openGroupsByDefault = params.openGroupsByDefault || false;
        /** @type {Group[]} */
        this.groups = state.groups || [];
        this.activeFields = params.activeFields;
        this.isGrouped = true;
        this.quickCreateInfo = null; // Lazy loaded;
    }

    get commonGroupParams() {
        return {
            fields: this.fields,
            activeFields: this.activeFields,
            resModel: this.resModel,
            domain: this.domain,
            groupBy: this.groupBy.slice(1),
            context: this.context,
            orderBy: this.orderBy,
            limit: this.limit,
            groupByInfo: this.groupByInfo,
            onRecordWillSwitchMode: this.onRecordWillSwitchMode,
        };
    }

    /**
     * List of loaded records inside groups.
     */
    get records() {
        return this.groups
            .filter((group) => !group.isFolded)
            .map((group) => group.list.records)
            .flat();
    }

    /**
     * @param {string} shortType
     * @returns {boolean}
     */
    groupedBy(shortType) {
        const { type } = this.groupByField;
        switch (shortType) {
            case "m2o":
            case "many2one": {
                return type === "many2one";
            }
            case "o2m":
            case "one2many": {
                return type === "one2many";
            }
            case "m2m":
            case "many2many": {
                return type === "many2many";
            }
            case "m2x":
            case "many2x": {
                return ["many2one", "many2many"].includes(type);
            }
            case "x2m":
            case "x2many": {
                return ["one2many", "many2many"].includes(type);
            }
        }
        return false;
    }

    exportState() {
        return {
            ...super.exportState(),
            groups: this.groups,
        };
    }

    canQuickCreate() {
        return super.canQuickCreate() && this.groups.length;
    }

    async load() {
        this.groups = await this._loadGroups();
        await Promise.all(this.groups.map((group) => group.load()));
    }

    async resequence() {
        this.groups = await this._resequence(this.groups, "value", ...arguments);
    }

    /**
     * @param {any} value
     * @returns {Promise<Group>}
     */
    async createGroup(value) {
        const [id, displayName] = await this.model.mutex.exec(() =>
            this.model.orm.call(this.groupByField.relation, "name_create", [value], {
                context: this.context,
            })
        );
        const group = this.model.createDataPoint("group", {
            ...this.commonGroupParams,
            count: 0,
            value: id,
            displayName,
            aggregates: {},
            groupByField: this.groupByField,
            // FIXME
            // groupDomain: this.groupDomain,
        });
        group.isFolded = false;
        return this.addGroup(group);
    }

    async quickCreate(group) {
        if (this.model.useSampleModel) {
            // Empty the groups because they contain sample data
            this.groups.map((group) => group.empty());
        }
        this.model.useSampleModel = false;
        if (!this.quickCreateInfo) {
            this.quickCreateInfo = await this._loadQuickCreateView();
        }
        group = group || this.groups[0];
        if (group.isFolded) {
            await group.toggle();
        }
        await group.quickCreate(this.quickCreateInfo.activeFields, this.context);
    }

    /**
     * @param {Group[]} groups
     * @returns {Promise<void>}
     */
    async deleteGroups(groups) {
        let shouldReload = false;
        await Promise.all(
            groups.map(async (group) => {
                await group.delete();
                if (!this.model.useSampleModel && group.list.records.length) {
                    shouldReload = true;
                }
            })
        );
        if (shouldReload) {
            await this.model.load();
        } else {
            for (const group of groups) {
                this.removeGroup(group);
            }
        }
    }

    /**
     * @param {Group} group
     * @param {number} [index]
     * @returns {Group}
     */
    addGroup(group, index) {
        this.groups.splice(Number.isInteger(index) ? index : this.count, 0, group);
        this.count++;
        this.model.notify();
        return group;
    }

    /**
     * @param {Group} group
     * @returns {Group}
     */
    removeGroup(group) {
        const index = this.groups.findIndex((g) => g === group);
        this.groups.splice(index, 1);
        this.count--;
        this.model.notify();
        return group;
    }

    // ------------------------------------------------------------------------
    // Protected
    // ------------------------------------------------------------------------

    async _loadGroups() {
        const orderby = orderByToString(this.orderBy);
        const { groups, length } = await this.model.orm.webReadGroup(
            this.resModel,
            this.domain,
            this.fieldNames,
            this.groupBy,
            { orderby, lazy: true }
        );
        this.count = length;

        const groupByField = this.groupByField;
        let openGroups = 0;

        const groupsParams = groups.map((data) => {
            const groupParams = {
                ...this.commonGroupParams,
                aggregates: {},
                groupByField,
            };
            for (const key in data) {
                const value = data[key];
                switch (key) {
                    case this.firstGroupBy: {
                        if (value && ["date", "datetime"].includes(groupByField.type)) {
                            const dateString = data.__range[groupByField.name].to;
                            const dateValue = this._parseServerValue(groupByField, dateString);
                            const granularity = groupByField.type === "date" ? "day" : "second";
                            groupParams.value = dateValue.minus({ [granularity]: 1 });
                        } else {
                            groupParams.value = Array.isArray(value) ? value[0] : value;
                        }
                        if (groupByField.type === "selection") {
                            groupParams.displayName = Object.fromEntries(groupByField.selection)[
                                groupParams.value
                            ];
                        } else {
                            groupParams.displayName = Array.isArray(value) ? value[1] : value;
                        }
                        if (this.groupedBy("m2x")) {
                            groupParams.recordParams = this.groupByInfo[this.firstGroupBy];
                        }
                        break;
                    }
                    case `${groupByField.name}_count`: {
                        groupParams.count = value;
                        break;
                    }
                    case "__domain": {
                        groupParams.groupDomain = value;
                        break;
                    }
                    case "__fold": {
                        // optional
                        groupParams.isFolded = value;
                        if (!value) {
                            openGroups++;
                        }
                        break;
                    }
                    case "__range": {
                        groupParams.range = value;
                        break;
                    }
                    case "__data": {
                        groupParams.data = value;
                        break;
                    }
                    default: {
                        // other optional aggregated fields
                        if (key in this.fields) {
                            groupParams.aggregates[key] = value;
                        }
                    }
                }
            }
            const previousGroup = this.groups.find(
                (g) => !g.deleted && g.value === groupParams.value
            );
            const state = previousGroup ? previousGroup.exportState() : {};
            return [groupParams, state];
        });

        // Unfold groups that can still be unfolded by default
        if (this.openGroupsByDefault) {
            for (const [params, state] of groupsParams) {
                if (openGroups >= this.constructor.DEFAULT_LOAD_LIMIT) {
                    break;
                }
                if (!("isFolded" in { ...params, ...state })) {
                    params.isFolded = false;
                    openGroups++;
                }
            }
        }

        return groupsParams.map(([params, state]) =>
            this.model.createDataPoint("group", params, state)
        );
    }

    async _loadQuickCreateView() {
        if (this.isLoadingQuickCreate) {
            return;
        }
        this.isLoadingQuickCreate = true;
        const { quickCreateView: viewRef } = this.model;
        const { ArchParser } = registry.category("views").get("form");
        let fieldsView = DEFAULT_QUICK_CREATE_VIEW;
        if (viewRef) {
            fieldsView = await this.model.keepLast.add(
                this.model.viewService.loadViews({
                    context: { ...this.context, form_view_ref: viewRef },
                    resModel: this.resModel,
                    views: [[false, "form"]],
                })
            );
        }
        this.isLoadingQuickCreate = false;
        return new ArchParser().parse(fieldsView.form.arch, fieldsView.form.fields);
    }
}

DynamicGroupList.DEFAULT_LOAD_LIMIT = 10;

export class Group extends DataPoint {
    setup(params, state) {
        this.value = params.value;
        this.displayName = params.displayName;
        this.aggregates = params.aggregates;
        this.groupDomain = params.groupDomain;
        this.range = params.range;
        this.count = params.count;
        this.groupByField = params.groupByField;
        this.groupByInfo = params.groupByInfo;
        this.recordParams = params.recordParams;
        if ("isFolded" in state) {
            this.isFolded = state.isFolded;
        } else if ("isFolded" in params) {
            this.isFolded = params.isFolded;
        } else {
            this.isFolded = true;
        }
        if (isRelational(this.groupByField)) {
            // If the groupBy field is a relational field, the group model must
            // then be the relation of that field.
            this.resModel = this.groupByField.relation;
        }
        const listParams = {
            data: params.data,
            domain: Domain.and([params.domain, this.groupDomain]).toList(),
            groupBy: params.groupBy,
            context: params.context,
            orderBy: params.orderBy,
            resModel: params.resModel,
            activeFields: params.activeFields,
            fields: params.fields,
            limit: params.limit,
            groupByInfo: params.groupByInfo,
            onRecordWillSwitchMode: params.onRecordWillSwitchMode,
        };
        this.list = this.model.createDataPoint("list", listParams, state.listState);
    }

    exportState() {
        return {
            isFolded: this.isFolded,
            listState: this.list.exportState(),
        };
    }

    empty() {
        this.count = 0;
        this.aggregates = {};
        this.list.empty();
    }

    getAggregableRecords() {
        return this.list.records.filter((r) => !r.isInQuickCreation);
    }

    getAggregates(fieldName) {
        return fieldName ? this.aggregates[fieldName] || 0 : this.count;
    }

    getServerValue() {
        const { name, selection, type } = this.groupByField;
        switch (type) {
            case "many2one":
            case "char":
            case "boolean": {
                return this.value || false;
            }
            case "selection": {
                const descriptor = selection.find((opt) => opt[0] === this.value);
                return descriptor && descriptor[0];
            }
            // for a date/datetime field, we take the last moment of the group as the group value
            case "date":
            case "datetime": {
                const range = this.range[name];
                if (!range) {
                    return false;
                }
                if (type === "date") {
                    return serializeDate(
                        DateTime.fromFormat(range.to, "yyyy-MM-dd", { zone: "utc" }).minus({
                            day: 1,
                        })
                    );
                } else {
                    return serializeDateTime(
                        DateTime.fromFormat(range.to, "yyyy-MM-dd HH:mm:ss").minus({ second: 1 })
                    );
                }
            }
            default: {
                return false; // other field types are not handled
            }
        }
    }

    async load() {
        if (!this.isFolded && this.count) {
            await this.list.load();
            if (this.recordParams) {
                this.record = this.makeRecord(this.recordParams);
                await this.record.load();
            }
        }
    }

    makeRecord(params) {
        return this.model.createDataPoint("record", {
            resModel: this.resModel,
            resId: this.value,
            context: this.context,
            ...params,
        });
    }

    async toggle() {
        this.isFolded = !this.isFolded;
        await this.model.keepLast.add(this.load());
        this.model.notify();
    }

    async delete() {
        this.deleted = true;
        if (this.record) {
            return this.record.delete();
        } else {
            return this.model.orm.unlink(this.resModel, [this.value], this.context);
        }
    }

    /**
     * @see DynamicRecordList.deleteRecords
     */
    async deleteRecords() {
        return this.list.deleteRecords(...arguments);
    }

    /**
     * @see DynamicRecordList.addRecord
     */
    addRecord(record, index) {
        this.count++;
        this.isFolded = false;
        return this.list.addRecord(record, index);
    }

    /**
     * @see DynamicRecordList.removeRecord
     */
    removeRecord(record) {
        this.count--;
        return this.list.removeRecord(record);
    }

    quickCreate(activeFields, context) {
        const ctx = {
            ...context,
            [`default_${this.groupByField.name}`]: this.getServerValue(),
        };
        return this.list.quickCreate(activeFields, ctx);
    }

    async validateQuickCreate() {
        const record = this.list.quickCreateRecord;
        if (!record) {
            return false;
        }
        await record.save();
        this.addRecord(this.removeRecord(record));
        this.count++;
        this.list.count++;
        return record;
    }
}

const add = (arr, el) => {
    const index = arr.indexOf(el);
    if (index === -1) {
        arr.push(el);
    }
};

const remove = (arr, el) => {
    const index = arr.indexOf(el);
    if (index > -1) {
        arr.splice(index, 1);
    }
};

// To put elsewhere

// local commands
const CREATE = 0;
const UPDATE = 1;
const DELETE = 2;
const FORGET = 3;
const LINK_TO = 4;

// global commands
const DELETE_ALL = 5;
const REPLACE_WITH = 6;

export class StaticList extends DataPoint {
    setup(params, state) {
        this._serverIds = params.resIds || [];

        this._commands = [];

        this._commandsById = {}; // to remove?

        this._commands = this._getNormalizedCommands([], params.commands || []); // modifies commands and this._commandsById in places

        this.offset = params.offset || 0;
        this.limit = params.limit || state.limit || this.constructor.DEFAULT_LIMIT;
        this.initialLimit = this.limit;
        this.editable = params.editable; // ("bottom" or "top")

        this.currentIds = this._getCurrentIds(this._serverIds, this._commands);

        this.orderBy = params.orderBy || [];

        // async computation that depends on previous params
        // to be initialized
        this.records = [];

        this._cache = {};
        this._mapping = {}; // maps record.resId || record.virtualId to record.id

        this.views = params.views || {};
        this.viewMode = params.viewMode;

        this.notYetValidated = null;
        this.onChanges = params.onChanges || (() => {});

        this.rawContext = params.rawContext;
        this.getEvalContext = params.getEvalContext;

        this.editedRecord = null;
        this.onRecordWillSwitchMode = async (record, mode) => {
            if (params.onRecordWillSwitchMode) {
                params.onRecordWillSwitchMode(record, mode);
            }
            const editedRecord = this.editedRecord;
            this.editedRecord = null;
            if (editedRecord) {
                await editedRecord.switchMode("readonly");
            }
            if (mode === "edit") {
                this.editedRecord = record;
            }
            if (this.notYetValidated) {
                const virtualId = this.notYetValidated;
                this.notYetValidated = null;
                this.applyCommand(Commands.delete(virtualId));
                delete this._cache[this._mapping[virtualId]]; // won't be used anymore
            }
        };
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    get count() {
        return this.currentIds.length;
    }

    /**
     * Add a true record in relation
     * @param {Object} params
     * @param {number} param.resId
     */
    async add(params) {
        if (!params.resId) {
            throw new Error("you rascal");
        }

        const { resId } = params;
        this.limit++;
        this.applyCommand(Commands.linkTo(resId));

        if (!this._mapping[resId]) {
            await this._createRecord(params);
        }

        this.records = this._getRecords();
        this.onChanges();
        this.model.notify(); // should be in onChanges?
    }

    /**
     * Add a new record in relation
     * @param {Object} params
     */
    async addNew(params) {
        if (params.resId) {
            throw new Error("you rascal");
        }

        const record = await this._createRecord(params);
        record._onWillSwitchMode(record, "edit");

        this.limit++;
        this.applyCommand(Commands.create(record.virtualId, record.data));

        for (const fieldName in this.activeFields) {
            if (this.fields[fieldName].type === "boolean") {
                continue;
            }
            if (record.isRequired(fieldName) && !record.data[fieldName]) {
                this.notYetValidated = record.virtualId;
                break;
            }
        }

        this.records = this._getRecords();
        this.onChanges();
        this.model.notify();
    }

    applyCommand(command) {
        this.applyCommands([command]);
    }

    /**
     * @param {Array[]} commands  array of commands
     */
    applyCommands(commands) {
        this._commands = this._getNormalizedCommands(this._commands, commands);
        this.currentIds = this._getCurrentIds(this.currentIds, commands);
    }

    /**
     * @param {RecordId} recordId
     */
    delete(recordId) {
        const record = this._cache[recordId];
        if (record.isVirtual) {
            delete this._cache[recordId];
        }
        const id = record.resId || record.virtualId;
        this.applyCommand(Commands.delete(id));

        this.records = this._getRecords();
        this.onChanges();
        this.model.notify();
    }

    discard() {
        for (const record of Object.values(this._cache)) {
            if (record.isVirtual) {
                delete this._cache[record.id];
            } else {
                record.discard();
            }
        }
        this.limit = this.initialLimit;
        this._commands = [];
        this._commandsById = {};
        this.currentIds = [...this._serverIds];
        this.load();
    }

    exportState() {
        return {
            limit: this.limit,
        };
    }

    async load() {
        if (!this.count) {
            return;
        }

        const orderFieldNames = this.orderBy.map((o) => o.name);
        const isAscByFieldName = {};
        for (const o of this.orderBy) {
            isAscByFieldName[o.name] = o.asc;
        }
        const compareRecords = (d1, d2) => {
            for (const fieldName of orderFieldNames) {
                let v1 = d1[fieldName];
                let v2 = d2[fieldName];
                if (this.fields[fieldName].type === "many2one") {
                    v1 = v1[1];
                    v2 = v2[1];
                }
                if (v1 !== v2) {
                    if (v1 < v2) {
                        return isAscByFieldName[fieldName] ? -1 : 1;
                    } else {
                        return isAscByFieldName[fieldName] ? 1 : -1;
                    }
                }
            }
            return 0;
        };

        const hasSeveralPages = this.limit < this.count;
        if (hasSeveralPages && orderFieldNames.length) {
            // there several pages in the x2many and it is ordered, so we must know the value
            // for the sorted field for all records and sort the resIds w.r.t. to those values
            // before fetching the activeFields for the resIds of the current page.
            // 1) populate values for already fetched records
            let recordValues = {};
            let resIds = [];
            for (const id of this.currentIds) {
                const recordId = this._mapping[id];
                if (recordId) {
                    const record = this._cache[recordId];
                    recordValues[id] = {};
                    for (const fieldName of orderFieldNames) {
                        recordValues[id][fieldName] = record.data[fieldName];
                    }
                } else {
                    resIds.push(id); // id is a resId
                }
            }
            // 2) fetch values for non loaded records
            if (resIds.length) {
                const result = await this.model.orm.read(this.resModel, resIds, orderFieldNames);
                for (const values of result) {
                    const resId = values.id;
                    recordValues[resId] = {};
                    for (const fieldName of orderFieldNames) {
                        recordValues[resId][fieldName] = values[fieldName];
                    }
                }
            }
            // 3) sort this.currentIds
            this.currentIds.sort((id1, id2) => {
                return compareRecords(recordValues[id1], recordValues[id2]);
            });
        }

        await this._completeCache();

        if (!hasSeveralPages && orderFieldNames.length) {
            this.currentIds.sort((id1, id2) => {
                const recId1 = this._mapping[id1];
                const recId2 = this._mapping[id2];
                return compareRecords(this._cache[recId1].data, this._cache[recId2].data);
            });
        }

        this.records = this._getRecords();
    }

    /**
     * @returns {Array[] | null}
     */
    getCommands() {
        if (this._commands.length) {
            const hasGlobalCommand =
                this._commands && [DELETE_ALL, REPLACE_WITH].includes(this._commands[0][0]);
            if (hasGlobalCommand) {
                return [...this._commands];
            }
            const extraCommands = [];
            for (const resId of this._serverIds) {
                if (!this._commandsById[resId]) {
                    extraCommands.push(Commands.linkTo(resId));
                }
            }
            return [...this._commands, ...extraCommands];
        }
        return null;
    }

    async replaceWith(resIds) {
        this.applyCommand(Commands.replaceWith(resIds));
        await this.load();
        this.model.notify();
    }

    async sortBy(fieldName) {
        if (this.orderBy.name === fieldName) {
            this.orderBy.asc = !this.orderBy.asc;
        } else {
            this.orderBy = { name: fieldName, asc: true };
        }
        await this.load();
        this.model.notify();
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Add missing records to cache
     */
    async _completeCache() {
        const displayedIds = this._getDisplayedIds();
        const proms = [];
        for (const id of displayedIds) {
            const recordId = this._mapping[id];
            if (!recordId) {
                const resId = id; // id is necessarily a resId (for now)
                proms.push(this._createRecord({ resId }));
            }
        }
        return Promise.all(proms);
    }

    async _createRecord(params) {
        const record = this.model.createDataPoint("record", {
            resModel: this.resModel,
            fields: this.fields,
            activeFields: this.activeFields,
            viewMode: this.viewMode,
            views: this.views,
            onRecordWillSwitchMode: this.onRecordWillSwitchMode,
            onChanges: () => {
                this.onChanges();
                this.applyCommand(
                    Commands.update(record.resId || record.virtualId, record.getChanges())
                );
                if (record.virtualId === this.notYetValidated) {
                    this.notYetValidated = null;
                }
            },
            ...params,
        });
        const id = record.resId || record.virtualId; // is resId sometimes changed after record creation?
        this._mapping[id] = record.id;
        this._cache[record.id] = record;
        await record.load();
        return record;
    }

    _getCurrentIds(currentIds, commands) {
        let nextIds = [...currentIds];
        for (const command of commands) {
            const code = command[0];
            const id = command[1];
            switch (code) {
                case 0: // create
                    if (nextIds.indexOf(id) === -1) {
                        const index =
                            this.editable === "top" ? this.offset : this.offset + this.limit - 1;
                        nextIds.splice(index, 0, id);
                    } else {
                        throw new Error("you rascal");
                    }
                    break;
                case 1: // update
                    add(nextIds, id);
                    break;
                case 2: // delete
                case 3: // forget
                    remove(nextIds, id);
                    break;
                case 4: // linkTo
                    add(nextIds, id);
                    break;
                case 5: // deleteAll
                case 6: // replaceWith
                    nextIds = command[2] || [];
                    break;
            }
        }
        return nextIds;
    }

    /**
     * Returns the array of visible ids (resId or virutalId)
     * @returns {Record[]}
     */
    _getDisplayedIds() {
        const hasSeveralPages = this.limit < this.count;
        let displayedIds = this.currentIds.slice(0);
        if (hasSeveralPages) {
            displayedIds = this.currentIds.slice(this.offset, this.offset + this.limit);
        }
        return displayedIds;
    }

    /**
     * Concat two arrays of commands and normalize the result
     * The first array must be normalized.
     * ! modifies in place the commands themselves ! TODO fix this
     * @param {Array[]} normalizedCommands normalized array of commands
     * @param {Array[]} commands  array of commands
     * @returns {Array[]} a normalized array of commands
     */
    _getNormalizedCommands(normalizedCommands, commands) {
        let nextCommands = [...normalizedCommands];
        for (const command of commands) {
            const code = command[0];
            const id = command[1];

            if ([DELETE_ALL, REPLACE_WITH].includes(code)) {
                this._commandsById = {};
                nextCommands = [command];
                continue;
            } else if (!this._commandsById[id]) {
                // possible problem with same ids (0) returned by server in accounting
                // -> add a test
                this._commandsById[id] = { [code]: command };
                nextCommands.push(command);
                continue;
            }

            switch (code) {
                case UPDATE:
                    // we assume that delete/forget cannot be found in this._commandsById[id]
                    // we can find create/linkTo/update
                    // we merge create/update and update/update
                    if (this._commandsById[id][CREATE]) {
                        this._commandsById[id][CREATE][2] = Object.assign(
                            this._commandsById[id][CREATE][2],
                            command[2]
                        );
                    } else if (this._commandsById[id][UPDATE]) {
                        this._commandsById[id][UPDATE][2] = Object.assign(
                            this._commandsById[id][UPDATE][2],
                            command[2]
                        );
                    } else {
                        if (this._commandsById[id][LINK_TO]) {
                            remove(nextCommands, this._commandsById[id][LINK_TO]);
                            delete this._commandsById[id][LINK_TO];
                        }

                        this._commandsById[id][UPDATE] = command;
                        nextCommands.push(command);
                    }
                    break;
                case DELETE:
                    // we assume that delete/forget cannot be found in this._commandsById[id]
                    // we can find create/linkTo/update
                    // if one finds create, we erase everything
                    // else we add delete and remove linkTo/update
                    if (this._commandsById[id][UPDATE]) {
                        remove(nextCommands, this._commandsById[id][UPDATE]);
                    }
                    if (this._commandsById[id][CREATE]) {
                        remove(nextCommands, this._commandsById[id][CREATE]);
                        delete this._commandsById[id];
                    } else {
                        if (this._commandsById[id][LINK_TO]) {
                            remove(nextCommands, this._commandsById[id][LINK_TO]);
                        }
                        this._commandsById[id] = { [DELETE]: command };
                        nextCommands.push(command);
                    }
                    break;
                case FORGET:
                    // we assume that delete/forget cannot be found in this._commandsById[id]
                    // we can find create/linkTo/update
                    // if one finds linkTo, we erase linkTo and forget
                    if (this._commandsById[id][LINK_TO]) {
                        remove(nextCommands, this._commandsById[id][LINK_TO]);
                        delete this._commandsById[id][LINK_TO];
                        // do we need to remove update?
                    } else {
                        this._commandsById[id][FORGET] = command;
                        nextCommands.push(command);
                    }
                    break;
                case LINK_TO:
                    // we assume that that create/delete cannot be found in this._commandsById[id]
                    if (this._commandsById[id][FORGET]) {
                        delete this._commandsById[id][FORGET];
                        remove(nextCommands, this._commandsById[id][FORGET]);
                    } else {
                        this._commandsById[id][LINK_TO] = command;
                        nextCommands.push(command);
                    }
                    break;
            }
        }
        return nextCommands;
    }

    /**
     * Returns visible records
     * @returns {Record[]}
     */
    _getRecords() {
        return this._getDisplayedIds().map((id) => this._cache[this._mapping[id]]);
    }
}

StaticList.DEFAULT_LIMIT = 80;

export class RelationalModel extends Model {
    setup(params, { action, dialog, notification, rpc, user, view }) {
        this.action = action;
        this.dialogService = dialog;
        this.notificationService = notification;
        this.rpc = rpc;
        this.viewService = view;
        this.orm = new RequestBatcherORM(rpc, user);
        this.keepLast = new KeepLast();
        this.mutex = new Mutex();

        this.onCreate = params.onCreate;
        this.quickCreateView = params.quickCreateView;
        this.defaultGroupBy = params.defaultGroupBy || false;
        this.defaultOrderBy = params.defaultOrder;
        this.rootType = params.rootType || "list";
        this.rootParams = {
            activeFields: params.activeFields || {},
            fields: params.fields || {},
            viewMode: params.viewMode || null,
            resModel: params.resModel,
            groupByInfo: params.groupByInfo,
        };
        if (this.rootType === "record") {
            this.rootParams.resId = params.resId;
            this.rootParams.resIds = params.resIds;
        } else {
            this.rootParams.openGroupsByDefault = params.openGroupsByDefault || false;
            this.rootParams.limit = params.limit;
        }

        // this.db = Object.create(null);
        this.root = null;

        this.nextId = 1;

        // debug
        window.basicmodel = this;
        // console.group("Current model");
        // console.log(this);
        // console.groupEnd();
    }

    /**
     * @param {Object} [params={}]
     * @param {Comparison | null} [params.comparison]
     * @param {Context} [params.context]
     * @param {DomainListRepr} [params.domain]
     * @param {string[]} [params.groupBy]
     * @param {Object[]} [params.orderBy]
     * @param {number} [params.resId] should not be there
     * @returns {Promise<void>}
     */
    async load(params = {}) {
        const rootParams = { ...this.rootParams, ...params };
        if (this.defaultOrderBy && !(params.orderBy && params.orderBy.length)) {
            rootParams.orderBy = this.defaultOrderBy;
        }
        if (
            this.defaultGroupBy &&
            !this.env.inDialog &&
            !(params.groupBy && params.groupBy.length)
        ) {
            rootParams.groupBy = [this.defaultGroupBy];
        }
        const state = this.root ? this.root.exportState() : {};
        const newRoot = this.createDataPoint(this.rootType, rootParams, state);
        await this.keepLast.add(newRoot.load());
        this.root = newRoot;
        this.rootParams = rootParams;
        this.notify();
    }

    /**
     * @param {"group" | "list" | "record"} type
     * @param {Record<any, any>} params
     * @param {Record<any, any>} [state={}]
     * @returns {DataPoint}
     */
    createDataPoint(type, params, state = {}) {
        let DpClass;
        switch (type) {
            case "group": {
                DpClass = this.constructor.Group;
                break;
            }
            case "list": {
                if (params.resIds) {
                    DpClass = this.constructor.StaticList;
                } else if ((params.groupBy || []).length) {
                    DpClass = this.constructor.DynamicGroupList;
                } else {
                    DpClass = this.constructor.DynamicRecordList;
                }
                break;
            }
            case "record": {
                DpClass = this.constructor.Record;
                break;
            }
        }
        return new DpClass(this, params, state);
    }

    get nextVirtualId() {
        return `virtual_${this.nextId++}`;
    }

    /**
     * @override
     */
    getGroups() {
        return this.root.groups && this.root.groups.length ? this.root.groups : null;
    }
}

RelationalModel.services = ["action", "dialog", "notification", "rpc", "user", "view"];
RelationalModel.Record = Record;
RelationalModel.Group = Group;
RelationalModel.DynamicRecordList = DynamicRecordList;
RelationalModel.DynamicGroupList = DynamicGroupList;
RelationalModel.StaticList = StaticList;
