/* @odoo-module */
// @ts-check

import { EventBus, markRaw } from "@odoo/owl";
import { WarningDialog } from "@web/core/errors/error_dialogs";
import { shallowEqual, unique } from "@web/core/utils/arrays";
import { KeepLast, Mutex } from "@web/core/utils/concurrency";
import { deepCopy } from "@web/core/utils/objects";
import { Model } from "@web/views/model";
import { orderByToString } from "@web/views/utils";
import { Record } from "./record";
import { DynamicRecordList } from "./dynamic_record_list";
import { DynamicGroupList } from "./dynamic_group_list";
import { Group } from "./group";
import { StaticList } from "./static_list";
import { getFieldsSpec, getOnChangeSpec } from "./utils";
import { DataPoint } from "./datapoint";

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
 * @property {Array<string>} [defaultOrder]
 * @property {Array<string>} [defaultGroupBy]
 * @property {boolean} [openGroupsByDefault]
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
    // static DEFAULT_X2M_LIMIT = 40; // FIXME: should be defined here
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
            domain: [],
            context: {},
            groupBy: [],
            orderBy: [],
            ...params.config,
        };

        this._urgentSave = false;

        this.initialLimit = params.limit || this.constructor.DEFAULT_LIMIT;
        this.initialGroupsLimit =
            params.groupsLimit ||
            (params.openGroupsByDefault
                ? this.constructor.DEFAULT_OPEN_GROUP_LIMIT
                : this.constructor.DEFAULT_GROUP_LIMIT);
        this.initialCountLimit = params.countLimit || this.constructor.DEFAULT_COUNT_LIMIT;
        this.defaultOrder = params.defaultOrder;
        this.defaultGroupBy = params.defaultGroupBy;
        this.openGroupsByDefault = params.openGroupsByDefault;
        this.maxGroupByDepth = params.maxGroupByDepth;

        this._onWillSaveRecord = params.onWillSaveRecord || (() => {});
        this._onRecordSaved = params.onRecordSaved || (() => {});
    }

    // -------------------------------------------------------------------------
    // Public
    // -------------------------------------------------------------------------

    /**
     *
     * @param {Config} config
     * @param {Partial<Config>} patch
     */
    async updateConfig(config, patch) {
        const tmpConfig = { ...config, ...patch }; //TODOPRO I wonder if we should not use deepCopy here
        const response = await this._loadData(tmpConfig);
        Object.assign(config, tmpConfig);
        return response;
    }

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
     * @param {string} [params.mode]
     * @param {number} [params.resId] should not be there
     * @returns {Promise<void>}
     */
    async load(params = {}) {
        let data;
        let config = deepCopy(this.config);
        if (params.values) {
            //TODOPRO What is values ? Update docstring
            data = params.values;
            if (params.mode) {
                config.mode = params.mode;
            }
        } else {
            config = this._enhanceConfig(config, params);
            data = await this.keepLast.add(this._loadData(config));
        }
        this.config = config;
        this.root = this._createRoot(data);

        window.root = this.root; //FIXME Remove this
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    /**
     * @param {Config} config
     * @param {*} params
     * @returns {Config}
     */
    _enhanceConfig(config, params) {
        const previousGroupBy = config.groupBy;
        Object.assign(config, params);
        // apply default order if no order
        if (this.defaultOrder && !config.orderBy.length) {
            config.orderBy = this.defaultOrder;
        }
        // apply default groupBy
        if (
            this.defaultGroupBy &&
            !this.env.inDialog && // FIXME ???
            !config.groupBy.length
        ) {
            config.groupBy = [this.defaultGroupBy];
        }
        // restrict the number of groupbys if requested
        if (this.maxGroupByDepth) {
            config.groupBy = config.groupBy.slice(0, this.maxGroupByDepth);
        }
        if (this.root) {
            // keep current root config if any, if the groupBy parameter is the same
            // if (shallowEqual(config.groupBy || [], previousGroupBy || [])) {
            //     config = deepCopy(this.root.config); //TODOPRO Check that
            //     config.offset = 0;
            // }
            // re-apply previous orderBy if not given (or no order)
            if (!config.orderBy) {
                config.orderBy = this.root.config.orderBy; //TODOPRO We should not access orderBy from root. I think it's the same as this.config.orderBy
            }
        }
        return config;
    }

    /**
     *
     * @param {*} data
     * @returns {DataPoint}
     */
    _createRoot(data) {
        /** @type {Config} */
        Object.assign(this.config, {
            data, //TODOPRO Move outside the config. Maybe later ?
        });
        if (this.config.isMonoRecord) {
            return new this.constructor.Record(this, this.config);
        }
        if (this.config.groupBy.length) {
            return new this.constructor.DynamicGroupList(this, this.config);
        }
        return new this.constructor.DynamicRecordList(this, this.config);
    }

    /**
     *
     * @param {Config} config
     */
    async _loadData(config) {
        if (config.isMonoRecord && !config.resId) {
            // FIXME: this will be handled by unity at some point
            return this._loadNewRecord(config);
        }
        if (!config.isMonoRecord && config.groupBy.length) {
            // FIXME: this *might* be handled by unity at some point
            return this._loadGroupedList(config);
        }
        if (config.isMonoRecord) {
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
        } else {
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
    }

    /**
     * @param {Config} config
     */
    async _loadGroupedList(config) {
        //TODOPRO Not a great fan of method that have a side effect on config. I think we should return the new config instead
        //modifying the config in place. It's a source of confusion
        config.offset = config.offset || 0;
        config.limit = config.limit || this.initialGroupsLimit;
        config.groups = config.groups || {};
        for (const group of Object.values(config.groups)) {
            //TODOPRO This will be removed when data will be extracted from the config
            delete group.data;
            delete group.list.data;
        }
        const firstGroupByName = config.groupBy[0].split(":")[0];
        const _orderBy = config.orderBy.filter(
            (o) => o.name === firstGroupByName || config.fields[o.name].group_operator !== undefined
        );
        const orderby = orderByToString(_orderBy);
        const response = await this.orm.webReadGroup(
            config.resModel,
            config.domain,
            unique([...Object.keys(config.activeFields), firstGroupByName]),
            [config.groupBy[0]], // TODO: expand attribute in list views
            {
                orderby,
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
            groupBy,
            groupByFieldName: groupByField.name,
            orderBy: config.orderBy,
            groupsLimit: config.limit,
        };
        for (const group of groups) {
            const domain = config.domain.concat(group.__domain);
            group.count = group.__count || group[`${firstGroupByName}_count`];
            group.length = group.count;
            delete group.__count;
            delete group[`${firstGroupByName}_count`];
            if (!config.groups[group[firstGroupByName]]) {
                config.groups[group[firstGroupByName]] = {
                    ...commonConfig,
                    domain,
                    isFolded: group.__fold || !this.openGroupsByDefault,
                    list: {
                        ...commonConfig,
                        domain,
                    },
                };
            }
            const groupConfig = config.groups[group[firstGroupByName]];
            groupConfig.data = group;
            groupConfig.list.data = group;
            if (groupBy.length) {
                group.groups = [];
            } else {
                group.records = [];
            }
            if (!groupConfig.isFolded && group.count > 0) {
                const response = await this._loadData({
                    ...groupConfig,
                    domain,
                    groupBy,
                });
                if (groupBy.length) {
                    group.groups = response ? response.groups : [];
                } else {
                    group.records = response ? response.records : [];
                }
            }
        }
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
        //TODOPRO Note: config is not modified anymore here \o/
        const kwargs = {
            context: { bin_size: true, ...context },
            fields: getFieldsSpec(activeFields, fields, context),
        };
        console.log("Unity field spec", kwargs.fields);
        const records = await this.orm.call(resModel, "web_read_unity", [resIds], kwargs);
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
        //TODOPRO Note: config is not modified anymore here \o/
        const kwargs = {
            fields: getFieldsSpec(config.activeFields, config.fields, config.context),
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
