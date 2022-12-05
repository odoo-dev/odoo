/** @odoo-module */

import { convertBrToLineBreak } from "@mail/new/utils/format";

export class Composer {
    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     */
    constructor(state, { threadId, messageId }) {
        const content = convertBrToLineBreak(state.messages[messageId].body);
        Object.assign(this, {
            messageId,
            threadId,
            textInputContent: content,
        });
    }
}
