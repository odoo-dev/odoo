import { AND, Record } from "@mail/core/common/record";
import { imageUrl } from "@web/core/utils/urls";
import { rpc } from "@web/core/network/rpc";

/**
 * @typedef {'offline' | 'bot' | 'online' | 'away' | 'im_partner' | undefined} ImStatus
 * @typedef Data
 * @property {number} id
 * @property {string} name
 * @property {string} email
 * @property {'partner'|'guest'} type
 * @property {ImStatus} im_status
 */

export class Role extends Record {
    static id = "id";

    /** @type {Object.<number, import("models").Persona>} */
    static records = {};
    /** @returns {import("models").Persona} */
    static get(data) {
        return super.get(data);
    }
    /** @returns {import("models").Persona|import("models").Persona[]} */
    static insert(data) {
        // debugger
        return super.insert(...arguments);
    }

    /** @type {string} */
    name;
}

Role.register();
