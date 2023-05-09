/** @odoo-module */

import { getPyEnv } from "@bus/../tests/helpers/mock_python_environment";

import { patch } from "@web/core/utils/patch";
import { session } from "@web/session";
import { fakeCookieService } from "@web/../tests/helpers/mock_services";
import { createWebClient } from "@web/../tests/webclient/helpers";
import { registerCleanup } from "@web/../tests/helpers/cleanup";
import {
    patchWithCleanup,
    makeDeferred,
    getFixture,
    getTriggerHotkey,
} from "@web/../tests/helpers/utils";

import { livechatBootService } from "@im_livechat/new/frontend/boot_service";
import { livechatService } from "@im_livechat/new/core/livechat_service";
import { autoPopupService } from "@im_livechat/new/core/autopopup_service";
import { LivechatButton } from "@im_livechat/new/core_ui/livechat_button";

import { App, onMounted } from "@odoo/owl";

import {
    setupManager,
    setupMessagingServiceRegistries,
} from "@mail/../tests/helpers/webclient_setup";
import {
    afterNextRender,
    getClick,
    getInsertText,
    getWaitUntil,
} from "@mail/../tests/helpers/test_utils";

// =============================================================================
// HELPERS
// =============================================================================

let shadowRoot;
QUnit.testDone(() => (shadowRoot = null));

export function click(selector) {
    return getClick({ target: shadowRoot, afterNextRender })(selector);
}

export function insertText(selector, text, options) {
    return getInsertText({ target: shadowRoot[0] })(selector, text, options);
}

export function triggerHotkey(key) {
    return getTriggerHotkey({ target: shadowRoot[0] })(key);
}

export function waitUntil(selector, count) {
    return getWaitUntil({ target: shadowRoot[0] })(selector, count);
}

let cookie = {};
QUnit.testDone(() => (cookie = {}));

/**
 * Set a cookie to be used by the current test.
 *
 * @param {string} key
 * @param {string} val
 */
export function setCookie(key, val) {
    cookie[key] = val;
}

// =============================================================================
// SETUP
// =============================================================================

/**
 * Setup the server side of the livechat app.
 *
 * @returns {Promise<number>} the id of the livechat channel.
 */
export async function loadDefaultConfig() {
    const pyEnv = await getPyEnv();
    const livechatChannelId = pyEnv["im_livechat.channel"].create({
        user_ids: [pyEnv.currentUserId],
    });
    patchWithCleanup(session, {
        livechatData: {
            isAvailable: true,
            serverUrl: window.origin,
            options: {
                header_background_color: "#875A7B",
                button_background_color: "#875A7B",
                title_color: "#FFFFFF",
                button_text_color: "#FFFFFF",
                button_text: "Have a Question? Chat with us.",
                input_placeholder: false,
                default_message: "Hello, how may I help you?",
                channel_name: "YourWebsite.com",
                channel_id: livechatChannelId,
                current_partner_id: pyEnv.currentPartnerId,
                default_username: "Visitor",
            },
        },
    });
    return livechatChannelId;
}

patch(App.prototype, "im_livechat", {
    mount() {
        registerCleanup(() => this.destroy());
        return this._super(...arguments);
    },
});

patch(setupManager, "im_livechat", {
    setupServices(...args) {
        const services = this._super(...args);
        return {
            "im_livechat.livechat": livechatService,
            "im_livechat.autopopup": autoPopupService,
            "im_livechat.boot": {
                ...livechatBootService,
                getTarget: () => getFixture(),
            },
            cookie: {
                start() {
                    const service = fakeCookieService.start(...arguments);
                    return {
                        ...service,
                        get current() {
                            return {
                                ...service.current,
                                ...cookie,
                            };
                        },
                    };
                },
            },
            ...services,
        };
    },
});

/**
 * Mount the livechat button into the webclient.
 *
 * @param {Object} param0
 * @returns {Promise<any>}
 */
export async function start({ mockRPC } = {}) {
    await setupMessagingServiceRegistries();
    const livechatButtonAvailableDeferred = makeDeferred();
    patchWithCleanup(LivechatButton.prototype, {
        setup() {
            this._super(...arguments);
            onMounted(() => livechatButtonAvailableDeferred.resolve());
        },
    });
    const pyEnv = await getPyEnv();
    const { env } = await createWebClient({
        serverData: {
            models: pyEnv.getData(),
            views: pyEnv.getViews(),
        },
        mockRPC,
    });
    await livechatButtonAvailableDeferred;
    shadowRoot = $(document.querySelector(".o-livechat-root").shadowRoot);
    return {
        env,
        root: shadowRoot,
    };
}
