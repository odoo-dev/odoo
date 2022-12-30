/** @odoo-module */

import { _t } from "@web/core/l10n/translation";

let nextId = 0;
export class NotificationGroup {
    /** @type {import("@mail/new/core/notification_model").Notification[]} */
    notifications = [];
    /** @type {string} */
    modelName;
    /** @type {string} */
    resModel;
    /** @type {number} */
    lastMessageId;
    /** @type {'sms' | 'email'} */
    type;

    static insert(state, data) {
        let group = state.notificationGroups.find((group) => {
            return group.resModel === data.resModel && group.type === data.type;
        });
        if (!group) {
            group = new NotificationGroup(state);
        }
        group.update(data);
        return group;
    }

    constructor(state) {
        this._state = state;
        this._state.notificationGroups.push(this);
        this.id = nextId++;
        // return reactive
        return state.notificationGroups.find((group) => group === this);
    }

    update(data) {
        Object.assign(this, {
            modelName: data.modelName ?? this.modelName,
            resModel: data.resModel ?? this.resModel,
            type: data.type ?? this.type,
            status: data.status ?? this.status,
        });
        const notifications = data.notifications ?? [];
        for (const [commandName, notification] of notifications) {
            if (commandName === "insert") {
                this.notifications.push(notification);
            }
        }
        this.lastMessageId = this.notifications[0]?.message.id;
        for (const notification of this.notifications) {
            if (this.lastMessageId < notification.message.id) {
                this.lastMessageId = notification.message.id;
            }
        }
    }

    get iconSrc() {
        return "/mail/static/src/img/smiley/mailfailure.jpg";
    }

    get body() {
        return _t("An error occurred when sending an email");
    }

    get lastMessage() {
        return this._state.messages[this.lastMessageId];
    }

    get dateTime() {
        return this.lastMessage?.dateTime;
    }
}
