/* @odoo-module */

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

    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {Object} data
     * @returns {Notification}
     */
    static insert(state, data) {
        let notification;
        if (data.id in state.notifications) {
            notification = state.notifications[data.id];
            notification.update(data);
            return notification;
        }
        notification = new Notification(state, data);
        // return reactive version
        return state.notifications[data.id];
    }

    constructor(state, data) {
        Object.assign(this, {
            id: data.id,
            _state: state,
        });
        this.update(data);
        state.notifications[this.id] = this;
    }

    get message() {
        return this._state.messages[this.messageId];
    }

    get isFailure() {
        return ["exception", "bounce"].includes(this.notification_status);
    }

    update(data) {
        Object.assign(this, {
            messageId: data.messageId,
            notification_status: data.notification_status,
            notification_type: data.notification_type,
        });
        if (!this.message.author.isCurrentUser) {
            return;
        }
        const thread = this.message.originThread;
        NotificationGroup.insert(this._state, {
            modelName: thread.modelName,
            resId: this.message.originThread.id,
            resModel: this.message.originThread.model,
            status: this.notification_status,
            type: this.notification_type,
            notifications: [[this.isFailure ? "insert" : "insert-and-unlink", this]],
        });
    }
}
