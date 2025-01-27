import { Record } from "@mail/core/common/record";

export class ResPartner extends Record {
    static _name = "res.partner";
    static id = "id";
    /** @type {string} */
    email;
    /** @type {string} */
    name;
}

ResPartner.register();
