/** @odoo-module **/

import { data } from "mail.discuss_public_template";
import { MainComponentsContainer } from "@web/core/main_components_container";
import { registry } from "@web/core/registry";
import { makeEnv, startServices } from "@web/env";
// import { session } from "@web/session";
import { templates } from "@web/core/assets";

// import * as legacySession from "web.session";

import { messagingService } from "../core/messaging_service";
import { soundEffects } from "../core/sound_effects_service";
import { userSettingsService } from "../core/user_settings_service";
import { stateService } from "../core/state_service";
import { chatWindowService } from "../chat/chat_window_service";
import { threadService } from "../thread/thread_service";
import { messageService } from "../thread/message_service";
import { suggestionService } from "../suggestion/suggestion_service";
import { mount, whenReady } from "@odoo/owl";
import { DiscussPublic } from "./discuss_public";

(async function boot() {
    await whenReady();

    const serviceRegistry = registry.category("services");
    serviceRegistry.add("mail.state", stateService);
    serviceRegistry.add("mail.soundEffects", soundEffects);
    serviceRegistry.add("mail.userSettings", userSettingsService);
    serviceRegistry.add("mail.chat_window", chatWindowService);
    serviceRegistry.add("mail.thread", threadService);
    serviceRegistry.add("mail.message", messageService);
    serviceRegistry.add("mail.messaging", messagingService);
    serviceRegistry.add("mail.suggestion", suggestionService);
    const mainComponentsRegistry = registry.category("main_components");
    mainComponentsRegistry.add("DiscussPublic", {
        Component: DiscussPublic,
        props: { data },
    });

    // await legacySession.is_bound;
    // Object.assign(odoo, {
    //     info: {
    //         db: session.db,
    //         server_version: session.server_version,
    //         server_version_info: session.server_version_info,
    //         isEnterprise: session.server_version_info.slice(-1)[0] === "e",
    //     },
    //     isReady: false,
    // });
    const env = makeEnv();
    await startServices(env);
    odoo.isReady = true;
    await mount(MainComponentsContainer, document.body, { env, templates, dev: env.debug });
})();
