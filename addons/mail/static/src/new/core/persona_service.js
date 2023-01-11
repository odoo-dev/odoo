/** @odoo-module */

import { Persona } from "@mail/new/core/persona_model";
import { createLocalId } from "./thread_model.create_local_id";

export class PersonaService {
    constructor(env, services) {
        this.env = env;
        this.rpc = services.rpc;
        /** @type {import("@mail/new/core/store_service").Store} */
        this.store = services["mail.store"];
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
    insert(data) {
        const localId = createLocalId(data.type, data.id);
        let persona = this.store.personas[localId];
        if (!persona) {
            persona = new Persona();
            persona._store = this.store;
            this.store.personas[localId] = persona;
            // Get reactive version.
            persona = this.store.personas[localId];
        }
        const {
            id = persona.id,
            name = persona.name,
            im_status = persona.im_status,
            email = persona.email,
            type,
        } = data;
        Object.assign(persona, {
            localId,
            id,
            name,
            im_status,
            email,
            type,
        });
        if (
            persona.type === "partner" &&
            persona.im_status !== "im_partner" &&
            !persona.is_public &&
            !this.store.registeredImStatusPartners.includes(persona.id)
        ) {
            this.store.registeredImStatusPartners.push(persona.id);
        }
        // return reactive version
        return persona;
    }
}

export const personaService = {
    dependencies: ["rpc", "mail.store"],
    start(env, services) {
        return new PersonaService(env, services);
    },
};
