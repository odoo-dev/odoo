/** @odoo-module **/

import { busService } from "@bus/services/bus_service";
import { imStatusService } from "@bus/im_status_service";
import { multiTabService } from "@bus/multi_tab_service";
import { makeMultiTabToLegacyEnv } from "@bus/services/legacy/make_multi_tab_to_legacy_env";
import { makeBusServiceToLegacyEnv } from "@bus/services/legacy/make_bus_service_to_legacy_env";
import { makeFakePresenceService } from "@bus/../tests/helpers/mock_services";

import { ActivityMenu } from "@mail/new/activity/activity_menu";
import { ChatWindowContainer } from "@mail/new/chat/chat_window_container";
import { MessagingMenu } from "@mail/new/messaging_menu/messaging_menu";
import { messagingService as newMessagingService } from "@mail/new/core/messaging_service";
import { messagingService } from "@mail/services/messaging_service";
import { systrayService } from "@mail/services/systray_service";
import { makeMessagingToLegacyEnv } from "@mail/utils/make_messaging_to_legacy_env";

import { fileUploadService } from "@web/core/file_upload/file_upload_service";
import { registry } from "@web/core/registry";
import { patchWithCleanup } from "@web/../tests/helpers/utils";
import { createWebClient } from "@web/../tests/webclient/helpers";
import { effectService } from "@web/core/effects/effect_service";
import { soundEffects } from "@mail/new/core/sound_effects_service";
import { userSettingsService } from "@mail/new/core/user_settings_service";
import { rtcService } from "@mail/new/rtc/rtc_service";
import { suggestionService } from "@mail/new/suggestion/suggestion_service";
import { storeService } from "@mail/new/core/store_service";
import { chatWindowService } from "@mail/new/chat/chat_window_service";
import { threadService } from "@mail/new/thread/thread_service";
import { messageService } from "@mail/new/thread/message_service";
import { activityService } from "@mail/new/activity/activity_service";
import { chatterService } from "@mail/new/views/chatter_service";
import { DiscussClientAction } from "@mail/new/discuss/discuss_client_action";
import { personaService } from "@mail/new/core/persona_service";
import { attachmentService } from "@mail/new/attachment_viewer/attachment_service";

const ROUTES_TO_IGNORE = [
    "/web/webclient/load_menus",
    "/web/dataset/call_kw/res.users/load_views",
    "/web/dataset/call_kw/res.users/systray_get_activities",
];
const WEBCLIENT_PARAMETER_NAMES = new Set([
    "legacyParams",
    "mockRPC",
    "serverData",
    "target",
    "webClientClass",
]);
const SERVICES_PARAMETER_NAMES = new Set([
    "legacyServices",
    "loadingBaseDelayDuration",
    "messagingBus",
    "services",
]);

/**
 * Add required components to the main component registry.
 */
function setupMainComponentRegistry() {
    const mainComponentRegistry = registry.category("main_components");
    mainComponentRegistry.add("mail.ChatWindowContainer", {
        Component: ChatWindowContainer,
    });
    registry.category("actions").add("mail.action_discuss", DiscussClientAction);
}

/**
 * Setup both legacy and new service registries.
 *
 * @param {Object} param0
 * @param {Object} [param0.services]
 * @param {number} [param0.loadingBaseDelayDuration=0]
 * @param {EventBus} [param0.messagingBus]
 * @returns {LegacyRegistry} The registry containing all the legacy services that will be passed
 * to the webClient as a legacy parameter.
 */
function setupMessagingServiceRegistries({ loadingBaseDelayDuration = 0, messagingBus, services }) {
    const serviceRegistry = registry.category("services");

    patchWithCleanup(messagingService, {
        async _startModelManager() {
            // never start model manager since it interferes with tests.
        },
    });

    const messagingValues = {
        start() {
            return {
                isInQUnitTest: true,
                disableAnimation: true,
                loadingBaseDelayDuration,
                messagingBus,
                userNotificationManager: { canPlayAudio: false },
            };
        },
    };

    services = {
        bus_service: busService,
        im_status: imStatusService,
        effect: effectService,
        "mail.suggestion": suggestionService,
        "mail.store": storeService,
        "mail.activity": activityService,
        "mail.attachment": attachmentService,
        "mail.chatter": chatterService,
        "mail.thread": threadService,
        "mail.message": messageService,
        "mail.chat_window": chatWindowService,
        "mail.messaging": newMessagingService,
        "mail.rtc": rtcService,
        "mail.sound_effects": soundEffects,
        "mail.user_settings": userSettingsService,
        "mail.persona": personaService,
        messaging: messagingService,
        messagingValues,
        presence: makeFakePresenceService({
            isOdooFocused: () => true,
        }),
        systrayService,
        multi_tab: multiTabService,
        ...services,
    };
    if (!serviceRegistry.contains("file_upload")) {
        serviceRegistry.add("file_upload", fileUploadService);
    }

    Object.entries(services).forEach(([serviceName, service]) => {
        serviceRegistry.add(serviceName, service);
    });
    registry
        .category("wowlToLegacyServiceMappers")
        .add("bus_service_to_legacy_env", makeBusServiceToLegacyEnv);
    registry
        .category("wowlToLegacyServiceMappers")
        .add("multi_tab_to_legacy_env", makeMultiTabToLegacyEnv);
    registry
        .category("wowlToLegacyServiceMappers")
        .add("messaging_service_to_legacy_env", makeMessagingToLegacyEnv);

    registry.category("systray").add(
        "mail.activity_menu",
        {
            Component: ActivityMenu,
        },
        { sequence: 20 }
    );
    registry.category("systray").add(
        "mail.messaging_menu",
        {
            Component: MessagingMenu,
        },
        { sequence: 25 }
    );
}

/**
 * Creates a properly configured instance of WebClient, with the messaging service and all it's
 * dependencies initialized.
 *
 * @param {Object} param0
 * @param {Object} [param0.serverData]
 * @param {Object} [param0.services]
 * @param {Object} [param0.loadingBaseDelayDuration]
 * @param {EventBus} [param0.messagingBus] The event bus to be used by messaging.
 * @returns {WebClient}
 */
async function getWebClientReady(param0) {
    setupMainComponentRegistry();

    const servicesParameters = {};
    const param0Entries = Object.entries(param0);
    for (const [parameterName, value] of param0Entries) {
        if (SERVICES_PARAMETER_NAMES.has(parameterName)) {
            servicesParameters[parameterName] = value;
        }
    }
    setupMessagingServiceRegistries(servicesParameters);

    const webClientParameters = {};
    for (const [parameterName, value] of param0Entries) {
        if (WEBCLIENT_PARAMETER_NAMES.has(parameterName)) {
            webClientParameters[parameterName] = value;
        }
    }
    return createWebClient(webClientParameters);
}

export { getWebClientReady, ROUTES_TO_IGNORE };
