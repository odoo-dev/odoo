/* @odoo-module */

import { createLocalId } from "./thread_model.create_local_id";

/**
 * @typedef Data
 * @property {import("@mail/new/core/guest_model").Guest} guest
 * @property {import("@mail/new/core/partner_model").Partner} partner
 */

export class Persona {
    partner;
    guest;

    get localId() {
        return this.partner
            ? createLocalId("Partner", this.partner.id)
            : createLocalId("Guest", this.guest.id);
    }

    get avatarUrl() {
        return this.partner?.avatarUrl || this.guest?.avatarUrl;
    }

    get name() {
        return this.partner?.name || this.guest?.name;
    }

    get im_status() {
        return this.partner?.im_status || this.guest?.im_status;
    }

    get nameOrDisplayName() {
        return this.partner ? this.partner.name || this.partner.display_name : this.guest.name;
    }
}
