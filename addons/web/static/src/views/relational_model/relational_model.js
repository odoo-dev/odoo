/* @odoo-module */
// @ts-check

import { EventBus, markRaw } from "@odoo/owl";
import { WarningDialog } from "@web/core/errors/error_dialogs";
import { shallowEqual, unique } from "@web/core/utils/arrays";
import { KeepLast, Mutex } from "@web/core/utils/concurrency";
import { Model } from "@web/views/model";
import { isRelational, orderByToString } from "@web/views/utils";
import { Record } from "./record";
import { DynamicRecordList } from "./dynamic_record_list";
import { DynamicGroupList } from "./dynamic_group_list";
import { Group } from "./group";
import { StaticList } from "./static_list";
import { getFieldContext, getOnChangeSpec } from "./utils";

// WOWL TOREMOVE BEFORE MERGE
// Changes:
// checkValidity/askChanges/save/isDirty:
//  -> first two are now private and save checks if record isDirty -> can be
//     called even is not dirty (+ option "force" to bypass isDirty check)

/**
 * @typedef Params
 * @property {Config} config
 * @property {number} [limit]
 * @property {number} [countLimit]
 * @property {number} [groupsLimit]
 * @property {Array<string>} [defaultOrderBy]
 * @property {Array<string>} [defaultGroupBy]
 * @property {number} [maxGroupByDepth]
 * @property {Function} [onRecordSaved]
 * @property {Function} [onWillSaveRecord]
 *
 *
 * @property {number} [countLimit]
 * @property {string} [rootType]
 * @property {string[]} groupBy
 */

/**
 * @typedef Config
 * @property {string} resModel
 * @property {Object} fields
 * @property {Object} activeFields
 * @property {Array} domain
 * @property {object} context
 * @property {Array} groupBy
 * @property {Array} orderBy
 * @property {boolean} [isMonoRecord]
 * @property {string} [resId]
 * @property {Array<string>} [resIds]
 * @property {string} [mode]
 * @property {number} [limit]
 * @property {number} [offset]
 * @property {number} [countLimit]
 * @property {number} [groupsLimit]
 * @property {Config} [config]
 * @property {Object} [groups]
 * @property {Object} [list]
 * @property {boolean} [isFolded]
 * @property {boolean} [openGroupsByDefault]
 * @property {any} [data]
 */

export class RelationalModel extends Model {
    static services = ["action", "company", "dialog", "notification", "rpc", "user"];
    static Record = Record;
    static Group = Group;
    static DynamicRecordList = DynamicRecordList;
    static DynamicGroupList = DynamicGroupList;
    static StaticList = StaticList;
    static DEFAULT_LIMIT = 80;
    static DEFAULT_X2M_LIMIT = 40;
    static DEFAULT_COUNT_LIMIT = 10000;
    static DEFAULT_GROUP_LIMIT = 80;
    static DEFAULT_OPEN_GROUP_LIMIT = 10;

    /**
     * @param {Params} params
     */
    setup(params, { action, company, dialog, notification, rpc, user }) {
        this.action = action;
        this.company = company;
        this.dialog = dialog;
        this.notification = notification;
        this.rpc = rpc;
        this.user = user;

        this.bus = new EventBus();

        this.keepLast = markRaw(new KeepLast());
        this.mutex = markRaw(new Mutex());

        /** @type {Config} */
        this.config = {
            isMonoRecord: false,
            ...params.config,
        };

        this._urgentSave = false;

        this.initialLimit = params.limit || this.constructor.DEFAULT_LIMIT;
        this.initialGroupsLimit = params.groupsLimit;
        this.initialCountLimit = params.countLimit || this.constructor.DEFAULT_COUNT_LIMIT;
        this.defaultOrderBy = params.defaultOrderBy;
        this.defaultGroupBy = params.defaultGroupBy;
        this.maxGroupByDepth = params.maxGroupByDepth;
        this.groupByInfo = params.groupByInfo || {};

        this._onWillSaveRecord = params.onWillSaveRecord || (() => {});
        this._onRecordSaved = params.onRecordSaved || (() => {});
    }

    // -------------------------------------------------------------------------
    // Public
    // -------------------------------------------------------------------------

    exportConfig() {
        return this.config;
    }

    hasData() {
        return this.root.hasData;
    }
    /**
     * @param {Object} [params={}]
     * @param {Comparison | null} [params.comparison]
     * @param {Context} [params.context]
     * @param {DomainListRepr} [params.domain]
     * @param {string[]} [params.groupBy]
     * @param {Object[]} [params.orderBy]
     * @returns {Promise<void>}
     */
    async load(params = {}) {
        const config = this._getNextConfig(this.config, params);
        if (!config.isMonoRecord && this.root) {
            // always reset the offset to 0 when reloading from above
            config.offset = 0;
        }
        const data = await this.keepLast.add(this._loadData(config));
        this.root = this._createRoot(config, data);
        this.config = config;

        window.root = this.root; //FIXME Remove this
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    /**
     *
     * @param {Config} config
     */
    _toggleGroup(config) {
        config.isFolded = !config.isFolded;
    }

    /**
     *
     * @param {Config} config
     * @param {Partial<Config>} patch
     * @param {Object} [options]
     * @param {boolean} [options.noReload=false]
     */
    async _updateConfig(config, patch, options = {}) {
        const tmpConfig = { ...config, ...patch }; //TODOPRO I wonder if we should not use deepCopy here
        let response;
        if (!options.noReload) {
            response = await this._loadData(tmpConfig);
        }
        Object.assign(config, tmpConfig);
        return response;
    }

    /**
     *
     * @param {Config} config
     * @returns {Promise<number>}
     */
    async _updateCount(config) {
        const count = await this.keepLast.add(this.orm.searchCount(config.resModel, config.domain));
        config.countLimit = Number.MAX_SAFE_INTEGER;
        return count;
    }

    _getFieldsSpec(activeFields, fields, evalContext, parentActiveFields = null) {
        console.log("getFieldsSpec");
        const fieldsSpec = {};
        for (const fieldName in activeFields) {
            const { related, limit, defaultOrderBy, invisible } = activeFields[fieldName];
            fieldsSpec[fieldName] = {};
            // X2M
            if (related) {
                fieldsSpec[fieldName].fields = this._getFieldsSpec(
                    related.activeFields,
                    related.fields,
                    evalContext,
                    activeFields
                );
                fieldsSpec[fieldName].limit = limit || this.constructor.DEFAULT_X2M_LIMIT;
                if (defaultOrderBy) {
                    fieldsSpec[fieldName].order = orderByToString(defaultOrderBy);
                }
            }
            // M2O
            if (fields[fieldName].type === "many2one" && invisible !== true) {
                fieldsSpec[fieldName].fields = { display_name: {} };
            }
            if (["many2one", "one2many", "many2many"].includes(fields[fieldName].type)) {
                const context = getFieldContext(
                    fieldName,
                    activeFields,
                    evalContext,
                    parentActiveFields
                );
                if (context) {
                    fieldsSpec[fieldName].context = context;
                }
            }
        }
        return fieldsSpec;
    }
    /**
     * @param {*} params
     * @returns {Config}
     */
    _getNextConfig(currentConfig, params) {
        const currentGroupBy = currentConfig.groupBy;
        const config = Object.assign({}, currentConfig);

        config.context = "context" in params ? params.context : config.context;
        if (!currentConfig.isMonoRecord) {
            config.domain = "domain" in params ? params.domain : config.domain;
            config.comparison = "comparison" in params ? params.comparison : config.comparison;

            // groupBy
            config.groupBy = "groupBy" in params ? params.groupBy : config.groupBy;
            // apply default groupBy if any
            if (this.defaultGroupBy && !config.groupBy.length) {
                // !this.env.inDialog && // FIXME ???
                config.groupBy = [this.defaultGroupBy];
            }
            // restrict the number of groupbys if requested
            if (this.maxGroupByDepth) {
                config.groupBy = config.groupBy.slice(0, this.maxGroupByDepth);
            }

            // orderBy
            config.orderBy = "orderBy" in params ? params.orderBy : config.orderBy;
            // apply default order if no order
            if (this.defaultOrderBy && !config.orderBy.length) {
                config.orderBy = this.defaultOrderBy;
            }
            // re-apply previous orderBy if not given (or no order)
            if (!config.orderBy.length) {
                config.orderBy = currentConfig.orderBy || [];
            }

            // keep current root config if any, if the groupBy parameter is the same
            if (!shallowEqual(config.groupBy || [], currentGroupBy || [])) {
                delete config.groups;
            }
        }

        return config;
    }

    /**
     *
     * @param {Config} config
     * @param {*} data
     * @returns {DataPoint}
     */
    _createRoot(config, data) {
        if (config.isMonoRecord) {
            return new this.constructor.Record(this, config, data);
        }
        if (config.groupBy.length) {
            return new this.constructor.DynamicGroupList(this, config, data);
        }
        return new this.constructor.DynamicRecordList(this, config, data);
    }

    /**
     *
     * @param {Config} config
     */
    async _loadData(config) {
        if (config.isMonoRecord) {
            if (!config.resId) {
                // FIXME: this will be handled by unity at some point
                return this._loadNewRecord(config);
            }
            const context = {
                ...config.context,
                active_id: config.resId,
                active_ids: [config.resId],
                active_model: config.resModel,
                current_company_id: this.company.currentCompany.id,
            };
            const records = await this._loadRecords({
                ...config,
                resIds: [config.resId],
                context,
            });
            return records[0];
        }
        if (config.resIds) {
            // static list
            const resIds = config.resIds.slice(config.offset, config.offset + config.limit);
            return this._loadRecords({ ...config, resIds });
        }
        if (config.groupBy.length) {
            // FIXME: this *might* be handled by unity at some point
            return this._loadGroupedList(config);
        }
        Object.assign(config, {
            limit: config.limit || this.initialLimit,
            countLimit: "countLimit" in config ? config.countLimit : this.initialCountLimit,
            offset: config.offset || 0,
        });
        if (config.countLimit !== Number.MAX_SAFE_INTEGER) {
            config.countLimit = Math.max(config.countLimit, config.offset + config.limit);
        }
        return this._loadUngroupedList(config);
    }

    /**
     * @param {Config} config
     */
    async _loadGroupedList(config) {
        //TODOPRO Not a great fan of method that have a side effect on config. I think we should return the new config instead
        //modifying the config in place. It's a source of confusion
        config.offset = config.offset || 0;
        config.limit = config.limit || this.initialGroupsLimit;
        if (!config.limit) {
            config.limit = config.openGroupsByDefault
                ? this.constructor.DEFAULT_OPEN_GROUP_LIMIT
                : this.constructor.DEFAULT_GROUP_LIMIT;
        }
        config.groups = config.groups || {};
        const firstGroupByName = config.groupBy[0].split(":")[0];
        const orderBy = config.orderBy.filter(
            (o) => o.name === firstGroupByName || config.fields[o.name].group_operator !== undefined
        );
        const response = await this.orm.webReadGroup(
            config.resModel,
            config.domain,
            unique([...Object.keys(config.activeFields), firstGroupByName]),
            [config.groupBy[0]], // TODO: expand attribute in list views
            {
                orderby: orderByToString(orderBy),
                lazy: true, // maybe useless
                offset: config.offset,
                limit: config.limit,
                context: config.context,
            }
        );
        const { groups, length } = response;
        const groupBy = config.groupBy.slice(1);
        const groupByField = config.fields[config.groupBy[0].split(":")[0]];
        const commonConfig = {
            resModel: config.resModel,
            fields: config.fields,
            activeFields: config.activeFields,
            context: config.context,
        };
        let groupRecordConfig;
        const groupRecordResIds = [];
        if (this.groupByInfo[firstGroupByName]) {
            groupRecordConfig = {
                ...this.groupByInfo[firstGroupByName],
                resModel: config.fields[firstGroupByName].relation,
                context: {},
            };
        }
        const proms = [];
        for (const group of groups) {
            group.count = group.__count || group[`${firstGroupByName}_count`];
            group.length = group.count;
            delete group.__count;
            delete group[`${firstGroupByName}_count`];
            if (!config.groups[group[firstGroupByName]]) {
                config.groups[group[firstGroupByName]] = {
                    ...commonConfig,
                    groupByFieldName: groupByField.name,
                    isFolded: group.__fold || !config.openGroupsByDefault,
                    list: {
                        ...commonConfig,
                        domain: group.__domain,
                        groupBy,
                    },
                };
                if (groupRecordConfig) {
                    const resId = group[firstGroupByName] ? group[firstGroupByName][0] : false;
                    config.groups[group[firstGroupByName]].record = {
                        ...groupRecordConfig,
                        resId,
                    };
                }
            }
            if (groupRecordConfig) {
                const resId = config.groups[group[firstGroupByName]].record.resId;
                if (resId) {
                    groupRecordResIds.push(resId);
                }
            }
            const groupConfig = config.groups[group[firstGroupByName]];
            groupConfig.list.orderBy = config.orderBy;
            if (groupBy.length) {
                group.groups = [];
            } else {
                group.records = [];
            }
            if (isRelational(config.fields[firstGroupByName]) && !group[firstGroupByName]) {
                groupConfig.isFolded = true;
            }
            if (!groupConfig.isFolded && group.count > 0) {
                const prom = this._loadData(groupConfig.list).then((response) => {
                    if (groupBy.length) {
                        group.groups = response ? response.groups : [];
                    } else {
                        group.records = response ? response.records : [];
                    }
                });
                proms.push(prom);
            }
        }
        if (groupRecordConfig && Object.keys(groupRecordConfig.activeFields).length) {
            const prom = this._loadRecords({
                ...groupRecordConfig,
                resIds: groupRecordResIds,
            }).then((records) => {
                for (const group of groups) {
                    group.values = records.find(
                        (r) => group[firstGroupByName] && r.id === group[firstGroupByName][0]
                    );
                }
            });
            proms.push(prom);
        }
        await Promise.all(proms);
        return { groups, length };
    }

    /**
     *
     * @param {Config} config
     * @returns
     */
    _loadNewRecord(config) {
        return this._onchange({
            resModel: config.resModel,
            spec: getOnChangeSpec(config.activeFields),
            context: config.context,
        });
    }

    async _onchange({ resModel, spec, resIds, changes, fieldNames, context }) {
        console.log("Onchange spec", spec);
        const args = [resIds || [], changes || {}, fieldNames || [], spec];
        const response = await this.orm.call(resModel, "onchange2", args, { context });
        console.log("Onchange response", response);
        if (response.warning) {
            const { type, title, message, className, sticky } = response.warning;
            if (type === "dialog") {
                this.dialog.add(WarningDialog, { title, message });
            } else {
                this.notification.add(message, {
                    className,
                    sticky,
                    title,
                    type: "warning",
                });
            }
        }
        return response.value;
    }

    /**
     *
     * @param {Config} config
     * @returns
     */
    async _loadRecords({ resModel, resIds, activeFields, fields, context }) {
        if (!resIds.length) {
            return [];
        }
        const kwargs = {
            context: { bin_size: true, ...context },
            fields: this._getFieldsSpec(activeFields, fields, context),
        };
        console.log("Unity field spec", kwargs.fields);
        const records = await this.orm.call(resModel, "web_read_unity", [resIds], kwargs);
        if (!records.length) {
            // see test "click on breadcrumb of a deleted record" (might missing a no error dialog assertion)
            throw new Error(`Can't fetch record(s) ${resIds}. They might have been deleted.`);
        }
        console.log("Unity response", records);
        return records;
    }

    /**
     * Load records from the server for an ungrouped list. Return the result
     * of unity read RPC.
     *
     * @param {Config} config
     * @returns
     */
    async _loadUngroupedList(config) {
        const kwargs = {
            fields: this._getFieldsSpec(config.activeFields, config.fields, config.context),
            domain: config.domain,
            offset: config.offset,
            order: orderByToString(config.orderBy),
            limit: config.limit,
            context: { bin_size: true, ...config.context },
            count_limit:
                config.countLimit !== Number.MAX_SAFE_INTEGER ? config.countLimit + 1 : undefined,
        };
        console.log("Unity field spec", kwargs.fields);
        const response = await this.orm.call(config.resModel, "web_search_read_unity", [], kwargs);
        console.log("Unity response", response);
        return response;
    }
}
