import { Domain } from "@web/core/domain";
import { pick } from "@web/core/utils/objects";
import { RelationalModel } from "@web/model/relational_model/relational_model";
import {
    extractInfoFromGroupData,
    getAggregateSpecifications,
    getFieldsSpec,
} from "@web/model/relational_model/utils";
import { orderByToString } from "@web/search/utils/order_by";
import { StockLocationDynamicGroupList } from "./stock_location_dynamic_group_list";

const LOCATION_GROUP_BY = "location_id";

/**
 * When the locations are grouped by warehouse, each warehouse group is turned
 * into a hierarchy of location groups:
 *  - a warehouse group only contains its top-level locations;
 *  - each location is displayed as a foldable group, holding the location
 *    record itself (so it can be selected);
 *  - unfolding a location group displays its direct sub-locations (the
 *    locations having it as `location_id`), as location groups too if they also
 *    have their own sub-locations.
 */
export class StockLocationListModel extends RelationalModel {
    static DynamicGroupList = StockLocationDynamicGroupList;

    /**
     * @override
     */
    async _loadGroupedList(config, cache) {
        if (config.isLocationHierarchy) {
            return this._loadLocationGroups(config);
        }
        const data = await super._loadGroupedList(config, cache);
        if (this._isGroupedByWarehouse(config)) {
            await this._setupWarehouseGroups(config, data);
        }
        return data;
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    _isGroupedByWarehouse(config) {
        return config.groupBy.length === 1 && config.groupBy[0] === "warehouse_id";
    }

    /**
     * Turns the list of each warehouse group into a list of location groups,
     * and loads the location groups of the unfolded warehouse groups.
     */
    async _setupWarehouseGroups(config, data) {
        const proms = data.groups.map(async (group) => {
            const groupConfig = config.groups[group.value];
            Object.assign(groupConfig.list, {
                groupBy: [LOCATION_GROUP_BY],
                groups: groupConfig.list.groups || {},
                isLocationHierarchy: true,
                // the warehouse list displays the top-level locations of its domain
                baseDomain: false,
            });
            delete group.records;
            group.groups = [];
            if (!groupConfig.isFolded) {
                const { groups, length } = await this._loadLocationGroups(groupConfig.list);
                group.groups = groups;
                group.length = length;
            }
        });
        await Promise.all(proms);
    }

    /**
     * Loads the locations of a list of the hierarchy as groups:
     *  - for a warehouse group (no `baseDomain`): its top-level locations;
     *  - for a location group: its direct sub-locations.
     *
     * `baseDomain` is the domain of the warehouse group the hierarchy belongs
     * to, all the locations of the hierarchy must match it.
     */
    async _loadLocationGroups(config) {
        config.offset = config.offset || 0;
        config.limit = config.limit || this._getLocationGroupsLimit();
        config.groups = config.groups || {};
        const { resModel } = config;
        const baseDomain = config.baseDomain || config.domain;
        const order = orderByToString(config.orderBy.filter((o) => o.name !== "__count"));

        // Force location `display_name` to simply be the location's name, not the full path.
        const context = { ...config.context, force_actual_name: true };

        // 1. the locations to display as groups, with all the data of their record
        const domain = config.baseDomain ? config.domain : this._getTopLevelDomain(config);
        const { records: locations, length } = await this.orm.webSearchRead(resModel, domain, {
            specification: {
                ...getFieldsSpec(config.activeFields, config.fields, context),
                display_name: {},
            },
            offset: config.offset,
            limit: config.limit,
            order,
            context,
        });
        if (!locations.length) {
            return { groups: [], length };
        }

        // 2. number of direct sub-locations (and aggregates) of each location
        const aggregates = getAggregateSpecifications(
            pick(config.fields, ...config.fieldsToAggregate)
        );
        const childrenGroups = await this.orm.formattedReadGroup(
            resModel,
            Domain.and([
                baseDomain,
                [[LOCATION_GROUP_BY, "in", locations.map((location) => location.id)]],
            ]).toList(),
            [LOCATION_GROUP_BY],
            ["__count", ...aggregates],
            { context }
        );
        const childrenGroupByLocationId = Object.fromEntries(
            childrenGroups.map((group) => [group[LOCATION_GROUP_BY][0], group])
        );

        // 3. build the groups (and their config), and load the unfolded ones
        const groups = locations.map(async (location) => {
            const { __domain, ...childrenGroup } = childrenGroupByLocationId[location.id] || {};
            const groupData = {
                ...childrenGroup,
                [LOCATION_GROUP_BY]: [location.id, location.display_name],
                __count: childrenGroup.__count || 0,
                __extra_domain: [[LOCATION_GROUP_BY, "=", location.id]],
            };
            const group = extractInfoFromGroupData(
                groupData,
                [LOCATION_GROUP_BY],
                config.fields,
                baseDomain
            );
            group.values = location;
            const groupConfig = this._getLocationGroupConfig(config, group, baseDomain);
            group.groups = [];
            if (!groupConfig.isFolded) {
                const { groups, length } = await this._loadLocationGroups(groupConfig.list);
                group.groups = groups;
                group.length = length;
            }
            return group;
        });
        return { groups: await Promise.all(groups), length };
    }

    /**
     * Creates or updates the config of a location group.
     */
    _getLocationGroupConfig(config, group, baseDomain) {
        const { resModel, fields, activeFields, fieldsToAggregate } = config;
        const commonConfig = { resModel, fields, activeFields, fieldsToAggregate, offset: 0 };
        if (!config.groups[group.value]) {
            config.groups[group.value] = {
                ...commonConfig,
                groupByFieldName: LOCATION_GROUP_BY,
                extraDomain: false,
                value: group.value,
                isFolded: true,
                isLocationGroup: true,
                list: {
                    ...commonConfig,
                    groupBy: [LOCATION_GROUP_BY],
                    groups: {},
                    limit: this._getLocationGroupsLimit(),
                    isLocationHierarchy: true,
                },
            };
        }
        const groupConfig = config.groups[group.value];
        const context = { ...config.context, [`default_${LOCATION_GROUP_BY}`]: group.value };
        groupConfig.context = context;
        groupConfig.initialDomain = group.domain;
        groupConfig.record = {
            resModel,
            fields,
            activeFields,
            context: config.context,
            resId: group.value,
            mode: "readonly",
        };
        Object.assign(groupConfig.list, {
            context,
            domain: group.domain,
            baseDomain,
            orderBy: config.orderBy,
        });
        return groupConfig;
    }

    _getLocationGroupsLimit() {
        return this.initialGroupsLimit || this.constructor.DEFAULT_GROUP_LIMIT;
    }

    /**
     * @returns the domain of the top-level locations of the given list.
     */
    _getTopLevelDomain(config) {
        const { domain, context, fields } = config;
        let parentDomain = domain;
        if (
            "active" in fields &&
            context.active_test !== false &&
            !this._hasActiveCondition(domain)
        ) {
            // the subquery on `location_id` ignores the `active_test` context
            parentDomain = Domain.and([domain, [["active", "=", true]]]).toList();
        }
        return Domain.and([domain, [[LOCATION_GROUP_BY, "not any", parentDomain]]]).toList();
    }

    /**
     * @param {DomainListRepr} domain
     * @returns {boolean} true if the domain explicitly filters on the `active` field
     */
    _hasActiveCondition(domain) {
        return domain.some((leaf) => Array.isArray(leaf) && leaf[0] === "active");
    }
}
