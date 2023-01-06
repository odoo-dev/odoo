/** @odoo-module **/

import { Partner } from "./partner_model";

export class MessageReactions {
    /** @type {string} */
    content;
    /** @type {number} **/
    count;
    /** @type {number[]} **/
    partnerIds = [];
    /** @type {number} **/
    messageId;
    /** @type {import("@mail/new/core/store_service").Store} */
    _store;

    /**
     * @param {import("@mail/new/core/store_service").Store} store
     * @param {Object} data
     * @returns {MessageReactions}
     */
    static insert(store, data) {
        let reaction = store.messages[data.message.id]?.reactions.find(
            ({ content }) => content === data.content
        );
        if (!reaction) {
            reaction = new MessageReactions();
            reaction._store = store;
        }
        const partnerIdsToUnlink = new Set();
        const alreadyKnownPartnerIds = new Set(reaction.partnerIds);
        for (const rawPartner of data.partners) {
            const [command, partnerData] = Array.isArray(rawPartner)
                ? rawPartner
                : ["insert", rawPartner];
            const partnerId = Partner.insert(store, partnerData).id;
            if (command === "insert" && !alreadyKnownPartnerIds.has(partnerId)) {
                reaction.partnerIds.push(partnerId);
            } else if (command !== "insert") {
                partnerIdsToUnlink.add(partnerId);
            }
        }
        Object.assign(reaction, {
            count: data.count,
            content: data.content,
            messageId: data.message.id,
            partnerIds: reaction.partnerIds.filter((id) => !partnerIdsToUnlink.has(id)),
        });
        return reaction;
    }

    get partners() {
        return this.partnerIds.map((id) => this._store.partners[id]);
    }
}
