import { applyFunDependOnSelectorAndExclude } from "@html_builder/plugins/utils";
import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import { ProcessStepsOption, reloadConnectors } from "./process_steps_option";

class ProcessStepsOptionPlugin extends Plugin {
    static id = "processStepsOption";
    selector = ".s_process_steps";
    resources = {
        builder_options: {
            OptionComponent: ProcessStepsOption,
            selector: this.selector,
        },
        // The reload of the connectors is done at the
        // 'content_updated_handlers' (each time there is a DOM mutation) and
        // not at the normalize as there are cases where we want to reload the
        // connectors even if there were no step added (e.g: a column of the
        // snippet is being resized).
        content_updated_handlers: (rootEl) =>
            applyFunDependOnSelectorAndExclude(reloadConnectors, rootEl, this.selector),
    };
}

registry.category("website-plugins").add(ProcessStepsOptionPlugin.id, ProcessStepsOptionPlugin);
