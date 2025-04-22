import { whenReady, mount, Plugin, App } from "@odoo/owl";
import { WebClient } from "./web_client";
import { getTemplate } from "@web/core/templates";
import { registry } from "@web/core/registry";
import { rpc } from "@web/core/rpc";
import { serviceManager } from "@web/core/services";

// class Test extends Plugin {
//     static id = "test";
//     static dependencies = ["rpc"];

//     async setup() {
//         const result = await this.plugins.rpc.call("/web/dataset/call_kw/res.partner/web_read", {
//             model: "res.partner",
//             kwargs: {
//                 specification: {
//                     display_name: {}
//                 }
//             },
//             method: "web_read",
//             args: [[34]]
//         });
//         console.log(result);
//     }
// }

// registry.get("services").addById(Test);

const config = {
    dev: true,
    name: "WebCore Playground",
    getTemplate,
    pluginManager: serviceManager
    // Plugins: registry.get("services").items
};

const app = new App(WebClient, config);

registry.get("services").addById(class AppPlugin extends Plugin {
    static id = "app";

    app = app;
});

export function getMainApp() {
    const appPlugin = getService("app");
    return appPlugin.app;
}


whenReady(() => app.mount(document.body));
