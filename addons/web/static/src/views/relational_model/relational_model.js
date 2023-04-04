/* @odoo-module */

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

// WOWL TOREMOVE BEFORE MERGE
// Changes:
// checkValidity/askChanges/save/isDirty:
//  -> first two are now private and save checks if record isDirty -> can be
//     called even is not dirty (+ option "force" to bypass isDirty check)

/**
 * @typedef Params
 * @property {number} [countLimit]
 * @property {string} [rootType]
 * @property {string[]} groupBy
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

        this.rootParams = markRaw(params);

        this._urgentSave = false;

        this.initialLimit = params.limit || this.constructor.DEFAULT_LIMIT;
        this.initialGroupsLimit =
            params.groupsLimit ||
            (params.expand
                ? this.constructor.DEFAULT_OPEN_GROUP_LIMIT
                : this.constructor.DEFAULT_GROUP_LIMIT);
        this.initialCountLimit = params.countLimit || this.constructor.DEFAULT_COUNT_LIMIT;
        delete this.rootParams.limit;
        delete this.rootParams.groupsLimit;
        delete this.rootParams.countLimit;

        this._onWillSaveRecord = params.onWillSaveRecord || (() => {});
        this._onRecordSaved = params.onRecordSaved || (() => {});
    }

    // -------------------------------------------------------------------------
    // Public
    // -------------------------------------------------------------------------

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
     * @param {number} [params.resId] should not be there
     * @returns {Promise<void>}
     */
    async load(params = {}) {
        let data;
        let config = {};
        const rootParams = { ...this.rootParams };
        if (params.values) {
            data = params.values;
            if (params.mode) {
                rootParams.mode = params.mode;
            }
        } else {
            const previousGroupBy = rootParams.groupBy;
            // rootParams must be changed directly, because we could get multiple
            // load requests, with different params, and they must be aggregated
            // TOCHECK: is it really true?
            Object.assign(rootParams, params);
            // FIXME: doesn't work (overruled by below)
            config.offset = rootParams.offset || config.offset;
            config.limit = rootParams.limit || config.limit;
            delete rootParams.limit;
            delete rootParams.offset;
            // apply default order if no order
            if (rootParams.defaultOrder && !rootParams.orderBy.length) {
                rootParams.orderBy = rootParams.defaultOrder;
            }
            // apply default groupBy
            if (
                rootParams.defaultGroupBy &&
                !this.env.inDialog && // FIXME ???
                !rootParams.groupBy.length
            ) {
                rootParams.groupBy = [rootParams.defaultGroupBy];
            }
            // restrict the number of groupbys if requested
            const maxGroupByDepth = rootParams.maxGroupByDepth;
            if (maxGroupByDepth) {
                rootParams.groupBy = rootParams.groupBy.slice(0, maxGroupByDepth);
            }
            if (this.root) {
                // keep current root config if any, if the groupBy parameter is the same
                if (shallowEqual(rootParams.groupBy || [], previousGroupBy || [])) {
                    config = deepCopy(this.root.config);
                    config.offset = 0;
                }
                // re-apply previous orderBy if not given (or no order)
                if (!rootParams.orderBy) {
                    rootParams.orderBy = this.root.orderBy;
                }
            }
            data = await this.keepLast.add(this._loadData(rootParams, config));
        }
        this.root = this._createRoot(rootParams, data, config);
        this.rootParams = rootParams;

        window.root = this.root;
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    _createRoot(params, data, config = {}) {
        const rootParams = {
            activeFields: params.activeFields,
            fields: params.fields,
            resModel: params.resModel,
            context: params.context,
            config,
            data,
        };
        if (params.rootType === "record") {
            return new this.constructor.Record(this, {
                ...rootParams,
                mode: params.mode,
                resIds: params.resIds,
            });
        } else {
            const listParams = {
                ...rootParams,
                domain: params.domain,
                groupBy: params.groupBy,
                orderBy: params.orderBy,
            };
            if (params.groupBy.length) {
                listParams.groupsLimit = params.groupsLimit;
                return new this.constructor.DynamicGroupList(this, listParams);
            } else {
                return new this.constructor.DynamicRecordList(this, listParams);
            }
        }
    }

    async _loadData(params, config = {}) {
        if (params.rootType === "record" && !params.resId) {
            // FIXME: this will be handled by unity at some point
            return this._loadNewRecord(params);
        }
        if (params.rootType !== "record" && params.groupBy.length) {
            // FIXME: this *might* be handled by unity at some point
            return this._loadGroupedList(params, config);
        }
        if (params.rootType === "record") {
            const context = {
                ...params.context,
                active_id: params.resId,
                active_ids: [params.resId],
                active_model: params.resModel,
                current_company_id: this.company.currentCompany.id,
            };
            const records = await this._loadRecords({
                resModel: params.resModel,
                activeFields: params.activeFields,
                fields: params.fields,
                context,
                resIds: [params.resId],
            });
            return records[0];
        } else {
            return this._loadUngroupedList(params, config);
        }
    }

    async _loadGroupedList(params, config = {}) {
        config.offset = config.offset || 0;
        config.limit = config.limit || this.initialGroupsLimit;
        config.groups = config.groups || {};
        const firstGroupByName = params.groupBy[0].split(":")[0];
        const _orderBy = params.orderBy.filter(
            (o) => o.name === firstGroupByName || params.fields[o.name].group_operator !== undefined
        );
        const orderby = orderByToString(_orderBy);
        const response = await this.orm.webReadGroup(
            params.resModel,
            params.domain,
            unique([...Object.keys(params.activeFields), firstGroupByName]),
            [params.groupBy[0]], // TODO: expand attribute in list views
            {
                orderby,
                lazy: true, // maybe useless
                offset: config.offset,
                limit: config.limit,
                context: params.context,
            }
        );
        const { groups, length } = response;
        const groupBy = params.groupBy.slice(1);
        for (const group of groups) {
            if (!config.groups[group[firstGroupByName]]) {
                config.groups[group[firstGroupByName]] = {
                    isFolded: group.__fold || !params.openGroupsByDefault,
                    list: {},
                };
            }
            const groupConfig = config.groups[group[firstGroupByName]];
            if (groupBy.length) {
                group.groups = [];
            } else {
                group.records = [];
            }
            let response;
            group.count = group.__count || group[`${firstGroupByName}_count`];
            delete group.__count;
            delete group[`${firstGroupByName}_count`];
            if (!groupConfig.isFolded && group.count > 0) {
                response = await this._loadData(
                    {
                        ...params,
                        domain: params.domain.concat(group.__domain),
                        groupBy,
                    },
                    groupConfig.list
                );
                if (groupBy.length) {
                    group.groups = response ? response.groups : [];
                } else {
                    group.records = response ? response.records : [];
                }
            }
        }
        return { groups, length };
    }

    _loadNewRecord(params) {
        return this._onchange({
            resModel: params.resModel,
            spec: getOnChangeSpec(params.activeFields),
            context: params.context,
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

    async _loadRecords({ resModel, resIds, activeFields, fields, context }) {
        const kwargs = {
            context: { bin_size: true, ...context },
            fields: getFieldsSpec(activeFields, fields, context),
        };
        console.log("Unity field spec", kwargs.fields);
        const records = await this.orm.call(resModel, "web_read_unity", [resIds], kwargs);
        console.log("Unity response", records);
        return records;
    }

    async _loadUngroupedList(
        { activeFields, context, domain, fields, orderBy = [], resModel },
        config = {}
    ) {
        config.limit = config.limit || this.initialLimit;
        config.countLimit = "countLimit" in config ? config.countLimit : this.initialCountLimit;
        config.offset = config.offset || 0;
        const kwargs = {
            fields: getFieldsSpec(activeFields, fields, context),
            domain,
            offset: config.offset,
            order: orderByToString(orderBy),
            limit: config.limit,
            context: { bin_size: true, ...context },
        };
        if (config.countLimit !== Number.MAX_SAFE_INTEGER) {
            config.countLimit = Math.max(config.countLimit, config.offset + config.limit);
            kwargs.count_limit = config.countLimit + 1;
        }
        console.log("Unity field spec", kwargs.fields);
        const response = await this.orm.call(resModel, "web_search_read_unity", [], kwargs);
        console.log("Unity response", response);
        return response;
    }
}
