/** @ts-check */

import { helpers } from "@odoo/o-spreadsheet";
import { globalFieldMatchingRegistry } from "@spreadsheet/global_filters/helpers";
import { CommandResult } from "@spreadsheet/o_spreadsheet/cancelled_reason";

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
    allowDispatch(cmd) {
        switch (cmd.type) {
            case "AUTO_MATCH_GLOBAL_FILTERS": {
                const matcher = globalFieldMatchingRegistry.get(cmd.dataSourceType);
                return !matcher.isValid(this.getters, cmd.dataSourceId)
                    ? CommandResult.DataSourceNotValid
                    : CommandResult.Success;
            }
        }
        return CommandResult.Success;
    }
    /**
     * Handle a spreadsheet command
     *
     * @param {import("@spreadsheet").AllCommand} cmd
     */
    handle(cmd) {
        switch (cmd.type) {
            case "SET_MANY_GLOBAL_FILTER_VALUE":
                for (const filter of cmd.filters) {
                    this.dispatch("SET_GLOBAL_FILTER_VALUE", {
                        id: filter.filterId,
                        value: filter.value,
                    });
                }
                break;
            case "AUTO_MATCH_GLOBAL_FILTERS": {
                const matcher = globalFieldMatchingRegistry.get(cmd.dataSourceType);
                const dataSourceId = cmd.dataSourceId;
                const fieldNames = cmd.fieldNames;
                const fields = matcher.getFields(this.getters, dataSourceId);
                this.generateMissingGlobalFilters(fields, fieldNames);
                this.autoMatchFields(matcher, fields, cmd.dataSourceType, dataSourceId, fieldNames);
            }
        }
    }

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
        const fieldFilters = {};
        const fieldsByModel = {};
        const blackList = [
            "activity_user_id", // from mail.activity.mixin, present in many search views but not useful for reporting
        ];
        for (const model in views) {
            const archs = views[model];
            fieldFilters[model] = [];
            for (const arch of archs) {
                // const fields = await this.fields.loadFields(model);
                debugger;
                const fields = await this.env.services.field.loadFields(model);
                fieldsByModel[model] = fields;
                const a = new SearchArchParser({ arch }, fields, {}).parse();
                const relationalFilters = a.preSearchItems
                    .flat()
                    .filter(
                        (item) =>
                            !blackList.includes(item.fieldName) &&
                            item.type === "field" &&
                            ["many2one", "many2many", "one2many"].includes(item.fieldType)
                    );
                fieldFilters[model].push(...relationalFilters);
            }
        }
        console.log(fieldFilters);
        const models = Object.keys(fieldFilters);
        const isMultiModel = models.length > 1;
        const suggestions = [];
        if (isMultiModel) {
            // all data sources must have a search field matching the model
            const baseModel = models.pop();
            const baseModelFields = fieldsByModel[baseModel];
            // uniquify the relations from the base model
            for (const candidateFilter of fieldFilters[baseModel]) {
                let isCandidate = true;
                const relation = baseModelFields[candidateFilter.fieldName].relation;
                for (const model of models) {
                    const fields = fieldsByModel[model];
                    const matchingFields = fieldFilters[model].filter(
                        (filterItem) => fields[filterItem.fieldName].relation === relation
                    );
                    if (matchingFields.length !== 1) {
                        isCandidate = false;
                        break;
                    }
                }
                if (isCandidate) {
                    const field = fieldsByModel[baseModel][candidateFilter.fieldName];
                    // field matching...
                    suggestions.push({
                        label: candidateFilter.description,
                        modelName: field.relation,
                        // id: candidateField.name,
                        // type: candidateField.fieldType,
                    });
                }
            }
        } else {
            const whiteList = ["res.partner", "res.users", "res.country"];
            const model = models[0];
            const filter = fieldFilters[model];
            for (const item of filter) {
                const field = fieldsByModel[model][item.fieldName];
                if (whiteList.includes(field.relation)) {
                    suggestions.push({
                        label: item.description,
                        modelName: field.relation,
                        // id: item.name,
                        // type: item.fieldType,
                    });
                }
            }

            // white list common models
            // res
        }
        console.log(suggestions);
        return suggestions;
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
