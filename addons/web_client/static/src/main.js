import { App, Plugin, whenReady } from "@odoo/owl";
import { getTemplate } from "@web/core/templates";
import { WebClient } from "@web_client/web_client/web_client";
import { service, serviceManager, serviceRegistry } from "@web_core/services";

const config = {
    dev: true,
    name: "WebCore Playground",
    getTemplate,
    pluginManager: serviceManager,
};

const app = new App(config);

class AppPlugin extends Plugin {
    static id = "app";
    static {
        serviceRegistry.addById(this);
    }

    app = app;
}

export function getMainApp() {
    const appPlugin = service(AppPlugin);
    return appPlugin.app;
}

whenReady(() => app.createRoot(WebClient).mount(document.body));
