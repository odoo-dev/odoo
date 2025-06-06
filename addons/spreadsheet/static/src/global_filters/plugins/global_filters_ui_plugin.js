/** @ts-check */

import { helpers } from "@odoo/o-spreadsheet";
import { globalFieldMatchingRegistry } from "@spreadsheet/global_filters/helpers";

import { SearchArchParser } from "@web/search/search_arch_parser";

const { UuidGenerator } = helpers;

/**
 * @typedef {import("@spreadsheet").GlobalFilter} GlobalFilter
 * @typedef {import("@spreadsheet").FieldMatching} FieldMatching
 * @typedef {import("@spreadsheet").DateGlobalFilter} DateGlobalFilter
 * @typedef {import("@spreadsheet").RelationalGlobalFilter} RelationalGlobalFilter
 */

import { OdooUIPlugin } from "@spreadsheet/plugins";

export class GlobalFiltersUIPlugin extends OdooUIPlugin {
    static getters = /** @type {const} */ (["getGlobalFilterSuggestions"]);

    constructor(config) {
        super(config);
        this.env = config.custom.env;
    }
    // allowDispatch(cmd) {
    //     switch (cmd.type) {
    //         case "AUTO_MATCH_GLOBAL_FILTERS": {
    //             const matcher = globalFieldMatchingRegistry.get(cmd.dataSourceType);
    //             return !matcher.isValid(this.getters, cmd.dataSourceId)
    //                 ? CommandResult.DataSourceNotValid
    //                 : CommandResult.Success;
    //         }
    //     }
    //     return CommandResult.Success;
    // }

    async getGlobalFilterSuggestions() {
        // const matcher = globalFieldMatchingRegistry.get(cmd.dataSourceType);
        const listActions = this.getters
            .getListIds()
            .map((listId) => this.getters.getListDefinition(listId).actionXmlId);
        const pivotActions = this.getters
            .getPivotIds()
            .map((pivotId) => this.getters.getPivotCoreDefinition(pivotId).actionXmlId);
        const xmlIds = listActions.concat(pivotActions).filter((xmlId) => !!xmlId);
        const views = await this.env.services.orm.call(
            "spreadsheet.mixin",
            "get_global_filter_suggestions",
            [xmlIds]
        );
        const dataSourceSearchFilters = {};
        for (const model in views) {
            const archs = views[model];
            for (const arch of archs) {
                dataSourceSearchFilters[model] = {
                    ...dataSourceSearchFilters[model],
                    ...(await this.getRelationalFiltersFromArch(model, arch)),
                };
            }
        }
        const relationsToDataSources = {};
        for (const dataSourceModel in dataSourceSearchFilters) {
            const fields = await this.env.services.field.loadFields(dataSourceModel);
            for (const fieldName in dataSourceSearchFilters[dataSourceModel]) {
                const relation = fields[fieldName]?.relation;
                if (!relationsToDataSources[relation]) {
                    relationsToDataSources[relation] = {};
                }
                if (!relationsToDataSources[relation][dataSourceModel]) {
                    relationsToDataSources[relation][dataSourceModel] = new Set();
                }
                relationsToDataSources[relation][dataSourceModel].add(fieldName);
            }
        }

        const existingFilters = new Set(
            this.getters
                .getGlobalFilters()
                .filter((filter) => filter.type === "relation")
                .map((filter) => filter.modelName)
        );
        const numberOfDataSourceModels = Object.keys(dataSourceSearchFilters).length;
        const validRelations = [];
        for (const relation in relationsToDataSources) {
            // all data sources must have one and only one search field matching the relation
            const matchingDataSourceModels = Object.keys(relationsToDataSources[relation]);
            const numberOfMatchingFields = Object.values(relationsToDataSources[relation])
                .map((fields) => fields.size)
                .reduce((acc, val) => acc + val, 0);
            if (
                matchingDataSourceModels.length === numberOfDataSourceModels &&
                numberOfMatchingFields === numberOfDataSourceModels &&
                !existingFilters.has(relation)
            ) {
                validRelations.push(relation);
            }
        }

        const suggestions = [];
        for (const relation of validRelations) {
            const fieldMatching = {};
            let filterLabel = "";
            for (const matcher of globalFieldMatchingRegistry.getAll()) {
                for (const dataSourceId of matcher.getIds(this.getters)) {
                    const model = matcher.getModel(this.getters, dataSourceId);
                    const matchingField = relationsToDataSources[relation][model]
                        ?.values()
                        .next().value;
                    fieldMatching[model] = matchingField;
                    filterLabel = dataSourceSearchFilters[model][matchingField].description; // last one wins
                }
            }
            suggestions.push({
                modelName: relation,
                label: filterLabel,
                fieldMatching,
            });
        }
        return suggestions;
    }

    /**
     * @private
     */
    async getRelationalFiltersFromArch(model, arch) {
        const blackList = [
            // ?
            "activity_user_id", // from mail.activity.mixin, present in many search views but not useful for reporting
            "activity_type_id", // also from mail.activity.mixin, not useful for reporting
        ];
        const fields = await this.env.services.field.loadFields(model);
        const parsedArch = new SearchArchParser({ arch }, fields, {}).parse();
        const relationalFilters = parsedArch.preSearchItems
            .flat()
            .filter(
                (item) =>
                    !blackList.includes(item.fieldName) &&
                    item.type === "field" &&
                    ["many2one", "many2many", "one2many"].includes(item.fieldType)
            );
        const result = {};
        for (const filter of relationalFilters) {
            result[filter.fieldName] = filter;
        }
        return result;
    }

    generateMissingGlobalFilters(fields, fieldNames) {
        const uuidGenerator = new UuidGenerator();
        for (const fieldName of fieldNames) {
            const coModel = fields[fieldName]?.relation;
            const matchingFilters = fieldNames.filter(
                (globalFilter) => globalFilter.modelName === coModel
            );
            if (matchingFilters.length === 0) {
                const filter = {
                    id: uuidGenerator.smallUuid(),
                    modelName: coModel,
                    type: "relation",
                    label: fields[fieldName]?.string,
                };
                this.dispatch("ADD_GLOBAL_FILTER", { filter });
            }
        }
    }

    autoMatchFields(dataSourceMatcher, fields, dataSourceType, dataSourceId, fieldNames) {
        const matcher = dataSourceMatcher;
        for (const filter of this.getters.getGlobalFilters()) {
            let matchingField;
            if (filter.modelName === matcher.getModel(this.getters, dataSourceId)) {
                matchingField = "id";
            } else {
                matchingField = fieldNames
                    .map((name) => fields[name])
                    .find((field) => field.searchable && field.relation === filter.modelName)?.name;
            }
            if (matchingField) {
                const existingMatching = {};
                for (const dataSourceId of matcher.getIds(this.getters)) {
                    existingMatching[dataSourceId] =
                        matcher.getFieldMatching(this.getters, dataSourceId, filter.id) ?? {};
                }
                existingMatching[dataSourceId] = {
                    chain: matchingField,
                    type: fields[matchingField]?.type,
                };
                this.dispatch("EDIT_GLOBAL_FILTER", {
                    filter,
                    [dataSourceType]: existingMatching,
                });
            }
        }
    }
}
