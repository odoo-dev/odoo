/** @odoo-module **/

import { messagingService } from "@mail/new/messaging_service";
import { ormService } from "@web/core/orm_service";
import { popoverService } from "@web/core/popover/popover_service";
import { EventBus } from "@odoo/owl";
import { hotkeyService } from "@web/core/hotkeys/hotkey_service";
import { notificationService } from "@web/core/notifications/notification_service";
import { fileUploadService } from "@web/core/file_upload/file_upload_service";
import { effectService } from "@web/core/effects/effect_service";
import { makeFakePresenceService } from "@bus/../tests/helpers/mock_services";
import { soundEffects } from "@mail/new/sound_effects_service";
import { userSettingsService } from "@mail/new/user_settings_service";
import { rtcService } from "@mail/new/rtc/rtc_service";
import { suggestionService } from "@mail/new/suggestion/suggestion_service";
import { stateService } from "@mail/new/core/state_service";

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
    const busService = new EventBus();
    const bus_service = {
        addEventListener: busService.addEventListener.bind(busService),
        removeEventListener: busService.removeEventListener.bind(busService),
        start() {},
    };
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
            presence: makeFakePresenceService(),
        },
    };
    const hotkey = hotkeyService.start(env, { ui });
    env.services.hotkey = hotkey;
    const orm = ormService.start(env, { rpc, user });
    env.services.orm = orm;
    const im_status = { registerToImStatus() {} };
    env.services.im_status = im_status;
    const soundEffect = soundEffects.start(env);
    env.services["mail.soundEffects"] = soundEffect;
    const userSettings = userSettingsService.start(env, { rpc, user });
    env.services["mail.userSettings"] = userSettings;
    const state = stateService.start();
    env.services["mail.state"] = state;
    const messaging = messagingService.start(env, {
        "mail.state": state,
        rpc,
        orm,
        user,
        router,
        bus_service,
        im_status,
        "mail.soundEffects": soundEffects,
        "mail.userSettings": userSettings,
    });
    const effect = effectService.start(env);
    env.services.effect = effect;
    env.services["mail.messaging"] = messaging;
    const suggestion = suggestionService.start(env, { "mail.messaging": messaging, orm });
    env.services["mail.suggestion"] = suggestion;
    const popover = popoverService.start();
    env.services.popover = popover;
    const notification = notificationService.start(env);
    env.services.notification = notification;
    const fileUpload = fileUploadService.start(env, { notification });
    env.services.file_upload = fileUpload;
    const rtc = rtcService.start(env, {
        "mail.messaging": messaging,
        notification,
        rpc,
        bus_service,
        "mail.soundEffects": soundEffects,
        "mail.userSettings": userSettings,
    });
    env.services["mail.rtc"] = rtc;
    return env;
}
