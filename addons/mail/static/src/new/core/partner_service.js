/** @odoo-module */

import { Partner } from "@mail/new/core/partner_model";
import { Persona } from "@mail/new/core/persona_model";
import { Guest } from "./guest_model";
import { createLocalId } from "./thread_model.create_local_id";

export class PartnerService {
    constructor(env, services) {
        this.env = env;
        /** @type {import("@mail/new/core/store_service").Store} */
        this.store = services["mail.store"];
    }

    /**
     * @param {import("@mail/new/core/partner_model").Data} data
     * @returns {import("@mail/new/core/partner_model").Partner}
     */
    insert(data) {
        let partner = this.store.partners[data.id];
        if (!partner) {
            partner = new Partner();
            partner._store = this.store;
            this.store.partners[data.id] = partner;
            // Get reactive version.
            partner = this.store.partners[data.id];
        }
        const {
            id = partner.id,
            name = partner.name,
            im_status = partner.im_status,
            email = partner.email,
        } = data;
        Object.assign(partner, {
            id,
            name,
            im_status,
            email,
        });
        this.insertPersona({ partner });
        if (
            partner.im_status !== "im_partner" &&
            !partner.is_public &&
            !this.store.registeredImStatusPartners.includes(partner.id)
        ) {
            this.store.registeredImStatusPartners.push(partner.id);
        }
        // return reactive version
        return partner;
    }

    insertGuest(data) {
        let guest = this.store.guests[data.id];
        if (!guest) {
            guest = new Guest();
            guest._store = this.store;
            this.store.guests[data.id] = guest;
            // Get reactive version.
            guest = this.store.guests[data.id];
        }
        const { id = guest.id, name = guest.name, im_status = guest.im_status } = data;
        Object.assign(guest, {
            id,
            name,
            im_status,
        });
        this.insertPersona({ guest });
        return guest;
    }

    async updateGuestName(guest, name) {
        await this.rpc("/mail/guest/update_name", {
            guest_id: guest.id,
            name,
        });
    }

    /**
     * @param {import("@mail/new/core/persona_model").Data} data
     * @returns {import("@mail/new/core/persona_model").Persona}
     */
    insertPersona(data) {
        const localId = data.partner
            ? createLocalId("Partner", data.partner.id)
            : createLocalId("Guest", data.guest.id);
        let persona = this.store.personas[localId];
        if (!persona) {
            persona = new Persona();
            persona._store = this.store;
            this.store.personas[localId] = persona;
            // Get reactive version.
            persona = this.store.personas[localId];
        }
        Object.assign(persona, {
            guest: data?.guest,
            partner: data?.partner,
        });
        return persona;
    }
}

export const partnerService = {
    dependencies: ["mail.store"],
    start(env, services) {
        return new PartnerService(env, services);
    },
};
