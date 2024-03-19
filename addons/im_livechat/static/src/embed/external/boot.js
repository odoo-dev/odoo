import { LivechatButton } from "@im_livechat/embed/common/livechat_button";
import { makeShadow, makeRoot } from "@im_livechat/embed/common/boot_helpers";

import { mount, whenReady } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { getTemplate } from "@web/core/templates";
import { MainComponentsContainer } from "@web/core/main_components_container";
import { registry } from "@web/core/registry";
import { makeEnv, startServices } from "@web/env";
import { session } from "@web/session";

(async function boot() {
    session.origin = session.livechatData.serverUrl;
    await whenReady();
    const mainComponentsRegistry = registry.category("main_components");
    mainComponentsRegistry.add("LivechatRoot", { Component: LivechatButton });
    const env = makeEnv();
    env.odooEmbedLivechat = true;
    await startServices(env);
    odoo.isReady = true;
    const target = await makeShadow(env, makeRoot(document.body));
    await mount(MainComponentsContainer, target, {
        env,
        getTemplate,
        translateFn: _t,
        dev: env.debug,
    });
})();
