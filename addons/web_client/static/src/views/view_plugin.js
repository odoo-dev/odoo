import { computed, plugin, Plugin, signal } from "@odoo/owl";
import { DisplayedActionPlugin } from "@web_client/action/displayed_action_plugin";
import { ViewLoaderPlugin } from "@web_client/views/view_loader_plugin";

export class ViewPlugin extends Plugin {
    static id = this.name;

    /** @private */
    displayedAction = plugin(DisplayedActionPlugin);
    /** @private */
    viewLoader = plugin(ViewLoaderPlugin);

    displayName = computed(() => this.displayedAction.description.display_name);
    fields = computed(() => this.viewLoader.models()[this.resModel()]);
    /** @type {import("@odoo/owl").ReactiveValue<string[]>} */
    modes = computed(() => this.displayedAction.description.view_mode.split(","));
    resModel = computed(() => this.displayedAction.description.res_model);
    archs = computed(() => this.viewLoader.archs());
    models = computed(() => this.viewLoader.models());

    mode = signal(this.modes()[0]);
    /** @type {import("@odoo/owl").Signal<number | false>} */
    recordId = signal(false);

    /** @private @type {string | null} */
    previousMode = null;

    setup() {
        console.log(this.displayedAction.description);
    }

    closeRecord() {
        if (this.previousMode) {
            this.switchView(this.previousMode);
        }
    }

    /**
     * @param {number | false} recordId
     */
    openRecord(recordId) {
        this.previousMode = this.mode();
        this.mode.set("form");
        this.recordId.set(recordId);
    }

    /**
     * @param {string} mode
     */
    switchView(mode) {
        this.previousMode = null;
        this.mode.set(mode);
        this.recordId.set(false);
    }
}
