/** @odoo-module **/

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

    get partners() {
        return this.partnerIds.map((id) => this._store.partners[id]);
    }
}
