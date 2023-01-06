/** @odoo-module */

import { _t } from "@web/core/l10n/translation";
import { removeFromArray } from "../utils/arrays";

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
    /** @type {Set<number>} */
    resIds = new Set();
    /** @type {'sms' | 'email'} */
    type;
    /** @type {import("@mail/new/core/store_service").Store} */
    _store;

    static insert(store, data) {
        let group = store.notificationGroups.find((group) => {
            return (
                group.resModel === data.resModel &&
                group.type === data.type &&
                (group.resModel !== "mail.channel" || group.resIds.has(data.resId))
            );
        });
        if (!group) {
            group = new NotificationGroup(store);
        }
        group.update(data);
        if (group.notifications.length === 0) {
            removeFromArray(store.notificationGroups, group);
        }
        return group;
    }

    constructor(store) {
        this._store = store;
        this._store.notificationGroups.push(this);
        this.id = nextId++;
        // return reactive
        return store.notificationGroups.find((group) => group === this);
    }

    update(data) {
        Object.assign(this, {
            modelName: data.modelName ?? this.modelName,
            resModel: data.resModel ?? this.resModel,
            type: data.type ?? this.type,
            status: data.status ?? this.status,
        });
        const notifications = data.notifications ?? [];
        const alreadyKnownNotifications = new Set(this.notifications.map(({ id }) => id));
        const notificationIdsToRemove = new Set();
        for (const [commandName, notification] of notifications) {
            if (commandName === "insert" && !alreadyKnownNotifications.has(notification.id)) {
                this.notifications.push(notification);
            } else if (commandName === "insert-and-unlink") {
                notificationIdsToRemove.add(notification.id);
            }
        }
        this.notifications = this.notifications.filter(
            ({ id }) => !notificationIdsToRemove.has(id)
        );
        this.lastMessageId = this.notifications[0]?.message.id;
        for (const notification of this.notifications) {
            if (this.lastMessageId < notification.message.id) {
                this.lastMessageId = notification.message.id;
            }
        }
        this.resIds.add(data.resId);
    }

    get iconSrc() {
        return "/mail/static/src/img/smiley/mailfailure.jpg";
    }

    get body() {
        return _t("An error occurred when sending an email");
    }

    get lastMessage() {
        return this._store.messages[this.lastMessageId];
    }

    get dateTime() {
        return this.lastMessage?.dateTime;
    }
}
