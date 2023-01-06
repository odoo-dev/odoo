/* @odoo-module */

import { Partner } from "@mail/new/core/partner_model";
import { _t } from "@web/core/l10n/translation";
import { NotificationGroup } from "./notification_group_model";

export class Notification {
    /** @type {number} */
    id;
    /** @type {number} */
    messageId;
    /** @type {string} */
    notification_status;
    /** @type {string} */
    notification_type;
    /** @type {Partner} */
    partner;
    /** @type {import("@mail/new/core/store_service").Store} */
    _store;

    /**
     * @param {import("@mail/new/core/store_service").Store} store
     * @param {Object} data
     * @returns {Notification}
     */
    static insert(store, data) {
        let notification;
        if (data.id in store.notifications) {
            notification = store.notifications[data.id];
            notification.update(data);
            return notification;
        }
        notification = new Notification(store, data);
        // return reactive version
        return store.notifications[data.id];
    }

    constructor(store, data) {
        Object.assign(this, {
            id: data.id,
            _store: store,
        });
        this.update(data);
        store.notifications[this.id] = this;
    }

    get message() {
        return this._store.messages[this.messageId];
    }

    get isFailure() {
        return ["exception", "bounce"].includes(this.notification_status);
    }

    get icon() {
        if (this.isFailure) {
            return "fa fa-envelope";
        }
        return "fa fa-envelope-o";
    }

    get label() {
        return "";
    }

    get statusIcon() {
        switch (this.notification_status) {
            case "sent":
                return "fa fa-check";
            case "bounce":
                return "fa fa-exclamation";
            case "exception":
                return "fa fa-exclamation";
            case "ready":
                return "fa fa-send-o";
            case "canceled":
                return "fa fa-trash-o";
        }
        return "";
    }

    get statusTitle() {
        switch (this.notification_status) {
            case "sent":
                return _t("Sent");
            case "bounce":
                return _t("Bounced");
            case "exception":
                return _t("Error");
            case "ready":
                return _t("Ready");
            case "canceled":
                return _t("Canceled");
        }
        return "";
    }

    update(data) {
        Object.assign(this, {
            messageId: data.messageId,
            notification_status: data.notification_status,
            notification_type: data.notification_type,
            partner: data.res_partner_id
                ? Partner.insert(this._store, {
                      id: data.res_partner_id[0],
                      name: data.res_partner_id[1],
                  })
                : undefined,
        });
        if (!this.message.author.isCurrentUser) {
            return;
        }
        const thread = this.message.originThread;
        NotificationGroup.insert(this._store, {
            modelName: thread.modelName,
            resId: this.message.originThread.id,
            resModel: this.message.originThread.model,
            status: this.notification_status,
            type: this.notification_type,
            notifications: [[this.isFailure ? "insert" : "insert-and-unlink", this]],
        });
    }
}
