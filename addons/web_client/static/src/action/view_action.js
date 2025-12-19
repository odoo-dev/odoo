import { Component, computed, plugin, signal, usePlugins, useResource, xml } from "@odoo/owl";
import { DisplayedActionPlugin } from "@web_client/action/displayed_action_plugin";
import { DebugPlugin } from "@web_client/debug_menu/debug_plugin";
import { ControlPanel } from "@web_client/views/control_panel";
import { ViewLoaderPlugin } from "@web_client/views/view_loader_plugin";
import { ViewPlugin } from "@web_client/views/view_plugin";
import { viewRegistry } from "@web_client/views/view_registry";

class UnknownViewMode extends Component {
    static template = xml`
        <ControlPanel/>
        <main class="px-3">
            Unknown view mode: <t t-out="this.view.mode()"/>
        </main>
    `;
    static components = { ControlPanel };

    view = plugin(ViewPlugin);
}

class LoadingView extends Component {
    static template = xml`
        <ControlPanel/>
        <main class="px-3">
            Loading...
        </main>
    `;
    static components = { ControlPanel };

    view = plugin(ViewPlugin);
}

export class ViewAction extends Component {
    static template = xml`<t t-component="this.component()"/>`;

    actionDisplay = plugin(DisplayedActionPlugin);
    debug = plugin(DebugPlugin);
    viewLoader = plugin(ViewLoaderPlugin);

    setup() {
        useResource(this.debug.items, [
            {
                label: `Model: ${this.actionDisplay.description.res_model}`,
                action: () => console.log("Open Model Info"),
            },
            { label: `Action`, action: () => console.log("Open Action Info") },
            { label: `View`, action: () => console.log("Open View Info") },
        ]);

        usePlugins([ViewPlugin]);
        const view = plugin(ViewPlugin);
        const loaded = signal(false);
        this.component = computed(() => {
            if (loaded()) {
                return viewRegistry.get(view.mode(), UnknownViewMode);
            } else {
                return LoadingView;
            }
        });
        const action = this.actionDisplay.description;
        this.viewLoader.loadView(action.res_model, action.id, action.views).then(() => {
            loaded.set(true);
        });
    }
}
