/** @odoo-module */

import { _t } from "@web/core/l10n/translation";
import { createLocalId } from "./thread_model.create_local_id";

export class Failure {
    /** @type {import("@mail/new/core/notification_model").Notification[]} */
    notifications;
    /** @type {string} */
    modelName;
    /** @type {string} */
    resModel;
    /** @type {number} */
    lastMessageId;
    /** @type {'sms' | 'email'} */
    type;

    static insert(state, data) {
        const { modelName, type } = data;
        let failure = state.menu.failures.find(
            ({ localId }) => localId === createLocalId(modelName, type)
        );
        if (!failure) {
            failure = new Failure(state, data);
        }
        failure.update(data);
        return failure;
    }

    constructor(state, data) {
        const { modelName, type } = data;
        this.localId = createLocalId(modelName, type);
        this._state = state;
        this._state.menu.failures.push(this);
        // return reactive
        return state.menu.failures.find((failure) => failure === this);
    }

    update(data) {
        this.notifications ??= data.notifications;
        this.modelName ??= data.modelName;
        this.resModel ??= data.resModel;
        this.type ??= data.type;
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

    get displayName() {
        return `${this.modelName}${
            this.notifications.length > 1 ? ` (${this.notifications.length})` : ""
        }`;
    }

    get lastMessage() {
        return this._state.messages[this.lastMessageId];
    }
}
