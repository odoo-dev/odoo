import { App, whenReady } from "@odoo/owl";
import { getTemplate } from "@web/core/templates";
import { startServices } from "@web/core/legacy_service_starter";
import { makeEnv } from "@web/env";
import { MySubscriptionDashboard } from "./dashboard";

export async function startDocClient() {
    await whenReady();

    const env = makeEnv();
    await startServices(env);

    const app = new App({ getTemplate, env });
    app.createRoot(MySubscriptionDashboard).mount(document.body);
}
