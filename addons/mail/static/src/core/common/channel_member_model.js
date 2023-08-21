/* @odoo-module */

import { Record, modelRegistry } from "@mail/core/common/record";
import { removeFromArray } from "@mail/utils/common/arrays";

/**
 * @class ChannelMember
 * @typedef Data
 * @property {number} id
 * @property {string} personaLocalId
 * @property {number} threadId
 */
export class ChannelMember extends Record {
    static ids = ["id"];
    /** @type {Object.<number, ChannelMember>} */
    static records = {};

    /**
     * @param {Object|Array} data
     * @returns {ChannelMember}
     */
    static insert(data) {
        const memberData = Array.isArray(data) ? data[1] : data;
        let member = this.records[memberData.id];
        if (!member) {
            this.records[memberData.id] = new ChannelMember();
            member = this.records[memberData.id];
            member._store = this.store;
        }
        this.update(member, data);
        return member;
    }

    static update(member, data) {
        const [command, memberData] = Array.isArray(data) ? data : ["insert", data];
        member.id = memberData.id;
        if ("persona" in memberData) {
            member.persona = this.store.Persona.insert({
                ...(memberData.persona.partner ?? memberData.persona.guest),
                type: memberData.persona.guest ? "guest" : "partner",
                country: memberData.persona.partner?.country,
                channelId: memberData.persona.guest ? memberData.channel.id : null,
            });
        }
        member.threadId = memberData.threadId ?? member.threadId ?? memberData.channel?.id;
        if (member.threadId && !member.thread) {
            this.store.Thread.insert({ id: member.threadId, model: "discuss.channel" });
        }
        switch (command) {
            case "insert":
                {
                    if (member.thread && member.notIn(member.thread.channelMembers)) {
                        member.thread.channelMembers.push(member);
                    }
                }
                break;
            case "unlink":
                removeFromArray(this.records, member);
            // eslint-disable-next-line no-fallthrough
            case "insert-and-unlink":
                if (member.thread) {
                    removeFromArray(member.thread.channelMembers, member);
                }
                break;
        }
    }

    /** @type {number} */
    id;
    personaLocalId;
    rtcSessionId;
    threadId;
    /** @type {import("@mail/core/common/store_service").Store */
    _store;

    get persona() {
        return this._store.Persona.records[this.personaLocalId];
    }

    set persona(persona) {
        this.personaLocalId = persona?.localId;
    }

    get rtcSession() {
        return this._store.RtcSession.records[this.rtcSessionId];
    }

    get thread() {
        return this._store.Thread.findById({ model: "discuss.channel", id: this.threadId });
    }

    /**
     * @returns {string}
     */
    getLangName() {
        return this.persona.lang_name;
    }
}

modelRegistry.add(ChannelMember.name, ChannelMember);
