import { BaseOptionComponent } from "@html_builder/core/utils";
import { useDynamicSnippetOption } from "./dynamic_snippet_hook";

export class DynamicSnippetOption extends BaseOptionComponent {
    static template = "html_builder.DynamicSnippetOption";
    static props = {
        fetchDynamicFilters: Function,
        fetchDynamicFilterTemplates: Function,
        slots: { type: Object, optional: true },
        modelNameFilter: { type: String },
    };

    setup() {
        super.setup();
        // specify model name in subclasses to filter the list of available model record filters
        // Indicates that some current options are a default selection.

        this.dynamicOptionParams = useDynamicSnippetOption(
            this.props.fetchDynamicFilters,
            this.props.fetchDynamicFilterTemplates,
            this.props.modelNameFilter
        );
    }
}
