/* @odoo-module */

import { cleanTerm } from "@mail/new/utils/format";

/**
 * @typedef Data
 * @property {number} id
 * @property {string} name
 * @property {string} email
 */

export class Partner {
    /** @type {number} */
    id;
    /** @type {string} */
    name;
    /** @type {string} */
    email;
    /** @type {'offline' | 'bot' | 'online' | 'away' | 'im_partner' | undefined} im_status */
    im_status;

    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {import("@mail/new/core/partner_model").Data} data
     * @returns {import("@mail/new/core/partner_model").Partner}
     */
    static insert(state, data) {
        let partner = state.partners[data.id];
        if (!partner) {
            partner = new Partner();
            partner._state = state;
            state.partners[data.id] = partner;
            // Get reactive version.
            partner = state.partners[data.id];
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
        if (
            partner.im_status !== "im_partner" &&
            !partner.is_public &&
            !state.registeredImStatusPartners.includes(partner.id)
        ) {
            state.registeredImStatusPartners.push(partner.id);
        }
        // return reactive version
        return partner;
    }

    get avatarUrl() {
        return `/mail/channel/1/partner/${this.id}/avatar_128`;
    }

    get nameOrDisplayName() {
        return this.name || this.display_name;
    }

    get isCurrentUser() {
        return this.id === this._state.user.partnerId;
    }

    static searchSuggestions(state, cleanedSearchTerm, thread, sort) {
        let partners;
        const isNonPublicChannel =
            thread &&
            (thread.type === "group" ||
                thread.type === "chat" ||
                (thread.type === "channel" && thread.serverData.group_based_subscription));
        if (isNonPublicChannel) {
            // Only return the channel members when in the context of a
            // group restricted channel. Indeed, the message with the mention
            // would be notified to the mentioned partner, so this prevents
            // from inadvertently leaking the private message to the
            // mentioned partner.
            partners = thread.channelMembers.map((member) => member.partner);
        } else {
            partners = Object.values(state.partners);
        }
        const mainSuggestionList = [];
        const extraSuggestionList = [];
        for (const partner of partners) {
            if (partner === state.partnerRoot) {
                // ignore archived partners (except OdooBot)
                continue;
            }
            if (!partner.name) {
                continue;
            }
            if (
                cleanTerm(partner.name).includes(cleanedSearchTerm) ||
                (partner.email && cleanTerm(partner.email).includes(cleanedSearchTerm))
            ) {
                if (partner.user) {
                    mainSuggestionList.push(partner);
                } else {
                    extraSuggestionList.push(partner);
                }
            }
        }
        const sortFunc = (a, b) => {
            const isAInternalUser = a.user && a.user.isInternalUser;
            const isBInternalUser = b.user && b.user.isInternalUser;
            if (isAInternalUser && !isBInternalUser) {
                return -1;
            }
            if (!isAInternalUser && isBInternalUser) {
                return 1;
            }
            if (thread?.serverData?.channel) {
                const isAMember = thread.serverData.channel.channelMembers[0][1].includes(a);
                const isBMember = thread.serverData.channel.channelMembers[0][1].includes(b);
                if (isAMember && !isBMember) {
                    return -1;
                }
                if (!isAMember && isBMember) {
                    return 1;
                }
            }
            if (thread) {
                const isAFollower = thread.followers.some((follower) => follower.partner === a);
                const isBFollower = thread.followers.some((follower) => follower.partner === b);
                if (isAFollower && !isBFollower) {
                    return -1;
                }
                if (!isAFollower && isBFollower) {
                    return 1;
                }
            }
            const cleanedAName = cleanTerm(a.name || "");
            const cleanedBName = cleanTerm(b.name || "");
            if (
                cleanedAName.startsWith(cleanedSearchTerm) &&
                !cleanedBName.startsWith(cleanedSearchTerm)
            ) {
                return -1;
            }
            if (
                !cleanedAName.startsWith(cleanedSearchTerm) &&
                cleanedBName.startsWith(cleanedSearchTerm)
            ) {
                return 1;
            }
            if (cleanedAName < cleanedBName) {
                return -1;
            }
            if (cleanedAName > cleanedBName) {
                return 1;
            }
            const cleanedAEmail = cleanTerm(a.email || "");
            const cleanedBEmail = cleanTerm(b.email || "");
            if (
                cleanedAEmail.startsWith(cleanedSearchTerm) &&
                !cleanedAEmail.startsWith(cleanedSearchTerm)
            ) {
                return -1;
            }
            if (
                !cleanedBEmail.startsWith(cleanedSearchTerm) &&
                cleanedBEmail.startsWith(cleanedSearchTerm)
            ) {
                return 1;
            }
            if (cleanedAEmail < cleanedBEmail) {
                return -1;
            }
            if (cleanedAEmail > cleanedBEmail) {
                return 1;
            }
            return a.id - b.id;
        };
        return [
            {
                type: "Partner",
                suggestions: sort ? mainSuggestionList.sort(sortFunc) : mainSuggestionList,
            },
            {
                type: "Partner",
                suggestions: sort ? extraSuggestionList.sort(sortFunc) : extraSuggestionList,
            },
        ];
    }
}
