/** @odoo-module **/

export class MessageReactions {
    /** @type {string} */
    content;
    /** @type {number} **/
    count;
    /** @type {number[]} **/
    personaLocalIds = [];
    /** @type {number} **/
    messageId;
    /** @type {import("@mail/discuss/core/store_service").Store} */
    _store;

    /** @type {import("@mail/discuss/core/persona_model").Persona[]} */
    get personas() {
        return this.personaLocalIds.map((localId) => this._store.personas[localId]);
    }
}
