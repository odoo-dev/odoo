import { useDomState } from "@html_builder/core/utils";
import { onWillStart, useState } from "@odoo/owl";

export function useDynamicSnippetOption(
    fetchDynamicFilters,
    fetchDynamicFilterTemplates,
    modelNameFilter,
    contextualFilterDomain = []
) {
    onWillStart(async () => {
        await fetchDynamicFiltersAndTemplates();
    });
    const state = useState({
        defaultFilterId: undefined,
        dynamicFilters: {}, // per id, to locate default filter
        dynamicFilterTemplates: {},
    });
    const domState = useDomState((editingElement) => ({
        filterId: editingElement.dataset.filterId,
    }));

    async function fetchDynamicFiltersAndTemplates() {
        const dynamicFilters = await fetchDynamicFilters({
            model_name: modelNameFilter,
            search_domain: contextualFilterDomain,
        });
        if (!dynamicFilters.length) {
            // Additional modules are needed for dynamic filters to be defined.
            return;
        }
        const uniqueModelName = new Set();
        for (const dynamicFilter of dynamicFilters) {
            state.dynamicFilters[dynamicFilter.id] = dynamicFilter;
            uniqueModelName.add(dynamicFilter.model_name);
        }
        state.defaultFilterId = dynamicFilters[0].id;
        const dynamicFilterTemplates = await fetchDynamicFilterTemplates({
            filter_name: modelNameFilter.replaceAll(".", "_"),
        });
        for (const dynamicFilterTemplate of dynamicFilterTemplates) {
            state.dynamicFilterTemplates[dynamicFilterTemplate.key] = dynamicFilterTemplate;
        }
        const defaultTemplatePerModel = {};
        for (const modelName of uniqueModelName) {
            for (const template of dynamicFilterTemplates) {
                if (template.key.includes(`_${modelName.replaceAll(".", "_")}_`)) {
                    defaultTemplatePerModel[modelName] = template;
                    break;
                }
            }
        }
        for (const dynamicFilter of dynamicFilters) {
            dynamicFilter.defaultTemplate = defaultTemplatePerModel[dynamicFilter.model_name];
        }
    }

    function getFilteredTemplates() {
        if (!Object.values(state.dynamicFilterTemplates).length) {
            return [];
        }
        const namePattern = `_${state.dynamicFilters[
            domState.filterId || state.defaultFilterId
        ].model_name.replaceAll(".", "_")}_`;
        return Object.values(state.dynamicFilterTemplates).filter((template) =>
            template.key.includes(namePattern)
        );
    }
    function showFilterOption() {
        return Object.values(state.dynamicFilters).length > 1;
    }

    return { state, domState, getFilteredTemplates, showFilterOption };
}
