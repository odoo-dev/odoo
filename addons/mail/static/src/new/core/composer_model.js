/* @odoo-module */

import { convertBrToLineBreak } from "@mail/new/utils/format";

export class Composer {
    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {Object} data
     * @returns {Composer}
     */
    static insert(state, data) {
        const composer = new Composer(data);
        if (data.messageId) {
            composer.textInputContent = convertBrToLineBreak(state.messages[data.messageId].body);
        }
        return composer;
    }

    constructor({ threadId, messageId }) {
        Object.assign(this, {
            messageId,
            threadId,
            textInputContent: "",
        });
    }
}
