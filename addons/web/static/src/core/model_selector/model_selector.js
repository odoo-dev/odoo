import { AutoComplete } from "@web/core/autocomplete/autocomplete";
import { useSuggester } from "@web/core/autocomplete/suggester_hook";
import { useService } from "@web/core/utils/hooks";
import { fuzzyLookup } from "@web/core/utils/search";
import { _t } from "@web/core/l10n/translation";

import { Component, onWillStart } from "@odoo/owl";

export class ModelSelector extends Component {
    static template = "web.ModelSelector";
    static components = { AutoComplete };
    static props = {
        onModelSelected: Function,
        id: { type: String, optional: true },
        value: { type: String, optional: true },
        placeholder: { type: String, optional: true },
        // list of models technical name, if not set
        // we will fetch all models we have access to
        models: { type: Array, optional: true },
    };

    setup() {
        this.orm = useService("orm");

        onWillStart(async () => {
            if (!this.props.models) {
                this.models = await this._fetchAvailableModels();
            } else {
                this.models = await this.orm.call("ir.model", "display_name_for", [
                    this.props.models,
                ]);
            }

            this.models = this.models.map((record) => ({
                cssClass: `o_model_selector_${record.model}`,
                data: {
                    technical: record.model,
                },
                label: record.display_name,
                onSelect: () => this.props.onModelSelected({
                    label: record.display_name,
                    technical: record.model,
                }),
            }));
        });

        const suggest = useSuggester((request) => {
            const options = this.filterModels(request);
            if (!options.length) {
                options.push({
                    cssClass: "o_m2o_no_result",
                    label: _t("No records"),
                });
            }
            return options;
        });
        this.modelSource = {
            options: suggest,
            placeholder: _t("Loading..."),
        };
    }

    get placeholder() {
        return this.props.placeholder || _t("Type a model here...");
    }

    filterModels(name) {
        if (!name) {
            const visibleModels = this.models.slice(0, 8);
            if (this.models.length - visibleModels.length > 0) {
                visibleModels.push({
                    label: _t("Start typing..."),
                    cssClass: "o_m2o_start_typing",
                });
            }
            return visibleModels;
        }
        return fuzzyLookup(name, this.models, (model) => model.data.technical + model.label);
    }

    /**
     * Fetch the list of the models that can be
     * selected for the relational properties.
     */
    async _fetchAvailableModels() {
        const result = await this.orm.call("ir.model", "get_available_models");
        return result || [];
    }
}
