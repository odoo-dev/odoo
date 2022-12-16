/** @odoo-module **/

import { messagingService } from "@mail/new/messaging_service";
import { activityService } from "@mail/new/activity/activity_service";
import { ormService } from "@web/core/orm_service";
import { popoverService } from "@web/core/popover/popover_service";
import { App, EventBus } from "@odoo/owl";
import { hotkeyService } from "@web/core/hotkeys/hotkey_service";
import { notificationService } from "@web/core/notifications/notification_service";
import { fileUploadService } from "@web/core/file_upload/file_upload_service";
import { effectService } from "@web/core/effects/effect_service";
import { makeFakePresenceService } from "@bus/../tests/helpers/mock_services";

const { afterNextRender } = App;

export { TestServer } from "./test_server";

export function makeTestEnv(rpc) {
    const user = {
        context: { uid: 2 },
        partnerId: 3,
    };
    const ui = {
        get activeElement() {
            return document.activeElement;
        },
    };
    const router = { current: { hash: { active_id: false } }, pushState() {} };
    const bus_service = new EventBus();
    const action = {};
    const env = {
        bus: new EventBus(),
        _t: (s) => s,
        services: {
            rpc,
            user,
            router,
            bus_service,
            action,
            dialog: {},
            ui,
            popover: {},
            "mail.activity": {},
            presence: makeFakePresenceService(),
        },
    };
    const hotkey = hotkeyService.start(env, { ui });
    env.services.hotkey = hotkey;
    const orm = ormService.start(env, { rpc, user });
    env.services.orm = orm;
    const im_status = { registerToImStatus() {} };
    env.services.im_status = im_status;
    const messaging = messagingService.start(env, {
        rpc,
        orm,
        user,
        router,
        bus_service,
        im_status,
    });
    const effect = effectService.start(env);
    env.services.effect = effect;
    env.services["mail.messaging"] = messaging;
    const activity = activityService.start(env, {
        action,
        bus_service,
        orm,
        "mail.messaging": messaging,
    });
    env.services["mail.activity"] = activity;
    const popover = popoverService.start();
    env.services.popover = popover;
    const notification = notificationService.start(env);
    env.services.notification = notification;
    const fileUpload = fileUploadService.start(env, { notification });
    env.services.file_upload = fileUpload;
    return env;
}

/**
 * @param {string} selector
 * @param {string} content
 */
export async function insertText(selector, content) {
    await afterNextRender(() => {
        document.querySelector(selector).focus();
        for (const char of content) {
            document.execCommand("insertText", false, char);
            document
                .querySelector(selector)
                .dispatchEvent(new window.KeyboardEvent("keydown", { key: char }));
            document
                .querySelector(selector)
                .dispatchEvent(new window.KeyboardEvent("keyup", { key: char }));
        }
    });
}
