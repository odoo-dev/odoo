/* @odoo-module */

import { cleanTerm } from "@mail/new/utils/format";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";

const commandRegistry = registry.category("mail.channel_commands");

class SuggestionService {
    constructor(env, services) {
        this.orm = services.orm;
        /** @type {import("@mail/new/core/store_service").Store} */
        this.store = services["mail.store"];
        /** @type {import("@mail/new/thread/thread_service").ThreadService} */
        this.thread = services["mail.thread"];
        /** @type {import("@mail/new/core/persona_service").PersonaService} */
        this.persona = services["mail.persona"];
    }

    async fetchSuggestions({ delimiter, term }, { thread } = {}) {
        const cleanedSearchTerm = cleanTerm(term);
        switch (delimiter) {
            case "@": {
                this.fetchPartners(cleanedSearchTerm, thread);
                break;
            }
            case ":":
                break;
            case "#":
                this.fetchThreads(cleanedSearchTerm);
                break;
            case "/":
                break;
        }
    }

    async fetchPartners(term, thread) {
        const kwargs = { search: term };
        const isNonPublicChannel =
            thread &&
            (thread.type === "group" ||
                thread.type === "chat" ||
                (thread.type === "channel" && thread.serverData.group_based_subscription));
        if (isNonPublicChannel) {
            kwargs.channel_id = thread.id;
        }
        const suggestedPartners = await this.orm.call(
            "res.partner",
            "get_mention_suggestions",
            [],
            kwargs
        );
        suggestedPartners.map((data) => {
            this.persona.insert({ ...data, type: "partner" });
        });
    }

    async fetchThreads(term) {
        const suggestedThreads = await this.orm.call(
            "mail.channel",
            "get_mention_suggestions",
            [],
            { search: term }
        );
        suggestedThreads.map((data) => {
            this.thread.insert({
                model: "mail.channel",
                ...data,
            });
        });
    }

    /**
     * Returns suggestions that match the given search term from specified type.
     *
     * @param {Object} [param0={}]
     * @param {String} [param0.delimiter] can be one one of the following: ["@", ":", "#", "/"]
     * @param {String} [param0.term]
     * @param {Object} [options={}]
     * @param {Integer} [options.thread] prioritize and/or restrict
     *  result in the context of given thread
     * @returns {[mainSuggestion[], extraSuggestion[]]}
     */
    searchSuggestions({ delimiter, term }, { thread } = {}, sort = false) {
        const cleanedSearchTerm = cleanTerm(term);
        switch (delimiter) {
            case "@": {
                return this.searchPartnerSuggestions(cleanedSearchTerm, thread, sort);
            }
            case ":":
                return this.searchCannedResponseSuggestions(cleanedSearchTerm, sort);
            case "#":
                return this.searchChannelSuggestions(cleanedSearchTerm, thread, sort);
            case "/":
                return this.searchChannelCommand(cleanedSearchTerm, thread, sort);
        }
        return [
            {
                type: undefined,
                suggestions: [],
            },
            {
                type: undefined,
                suggestions: [],
            },
        ];
    }

    searchChannelCommand(cleanedSearchTerm, thread, sort) {
        if (!["chat", "channel", "group"].includes(thread.type)) {
            // channel commands are channel specific
            return [[]];
        }
        const commands = commandRegistry
            .getEntries()
            .filter(([name, command]) => {
                if (!cleanTerm(name).includes(cleanedSearchTerm)) {
                    return false;
                }
                if (command.channel_types) {
                    return command.channel_types.includes(thread.type);
                }
                return true;
            })
            .map(([name, command]) => {
                return {
                    channel_types: command.channel_types,
                    help: command.help,
                    id: command.id,
                    name,
                };
            });
        const sortFunc = (a, b) => {
            const isATypeSpecific = a.channel_types;
            const isBTypeSpecific = b.channel_types;
            if (isATypeSpecific && !isBTypeSpecific) {
                return -1;
            }
            if (!isATypeSpecific && isBTypeSpecific) {
                return 1;
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
            return a.id - b.id;
        };
        return [
            {
                type: "ChannelCommand",
                suggestions: sort ? commands.sort(sortFunc) : commands,
            },
        ];
    }

    searchPartnerSuggestions(cleanedSearchTerm, thread, sort) {
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
            partners = thread.channelMembers
                .map((member) => member.persona)
                .filter((persona) => persona.type === "partner");
        } else {
            partners = Object.values(this.store.personas).filter(
                (persona) => persona.type === "partner"
            );
        }
        const mainSuggestionList = [];
        const extraSuggestionList = [];
        for (const partner of partners) {
            if (partner === this.store.partnerRoot) {
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

    searchCannedResponseSuggestions(cleanedSearchTerm, sort) {
        const cannedResponses = this.store.cannedResponses
            .filter((cannedResponse) => {
                return cleanTerm(cannedResponse.name).includes(cleanedSearchTerm);
            })
            .map(({ id, name, substitution }) => {
                return {
                    id,
                    name,
                    substitution: _t(substitution),
                };
            });
        const sortFunc = (a, b) => {
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
            return a.id - b.id;
        };
        return [
            {
                type: "CannedResponse",
                suggestions: sort ? cannedResponses.sort(sortFunc) : cannedResponses,
            },
        ];
    }

    searchChannelSuggestions(cleanedSearchTerm, thread, sort) {
        let threads;
        if (
            thread &&
            (thread.type === "group" ||
                thread.type === "chat" ||
                (thread.type === "channel" && thread.authorizedGroupFullName))
        ) {
            // Only return the current channel when in the context of a
            // group restricted channel or group or chat. Indeed, the message with the mention
            // would appear in the target channel, so this prevents from
            // inadvertently leaking the private message into the mentioned
            // channel.
            threads = [thread];
        } else {
            threads = Object.values(this.store.threads);
        }
        const suggestionList = threads.filter(
            (thread) =>
                thread.type === "channel" &&
                thread.displayName &&
                cleanTerm(thread.displayName).includes(cleanedSearchTerm)
        );
        const sortFunc = (a, b) => {
            const isAPublicChannel = a.type === "channel" && !a.authorizedGroupFullName;
            const isBPublicChannel = b.type === "channel" && !b.authorizedGroupFullName;
            if (isAPublicChannel && !isBPublicChannel) {
                return -1;
            }
            if (!isAPublicChannel && isBPublicChannel) {
                return 1;
            }
            const isMemberOfA = a.hasSelfAsMember;
            const isMemberOfB = b.hasSelfAsMember;
            if (isMemberOfA && !isMemberOfB) {
                return -1;
            }
            if (!isMemberOfA && isMemberOfB) {
                return 1;
            }
            const cleanedADisplayName = cleanTerm(a.displayName || "");
            const cleanedBDisplayName = cleanTerm(b.displayName || "");
            if (
                cleanedADisplayName.startsWith(cleanedSearchTerm) &&
                !cleanedBDisplayName.startsWith(cleanedSearchTerm)
            ) {
                return -1;
            }
            if (
                !cleanedADisplayName.startsWith(cleanedSearchTerm) &&
                cleanedBDisplayName.startsWith(cleanedSearchTerm)
            ) {
                return 1;
            }
            if (cleanedADisplayName < cleanedBDisplayName) {
                return -1;
            }
            if (cleanedADisplayName > cleanedBDisplayName) {
                return 1;
            }
            return a.id - b.id;
        };
        return [
            {
                type: "Thread",
                suggestions: sort ? suggestionList.sort(sortFunc) : suggestionList,
            },
        ];
    }
}

export const suggestionService = {
    dependencies: ["orm", "mail.store", "mail.thread", "mail.persona"],
    start(env, services) {
        return new SuggestionService(env, services);
    },
};
