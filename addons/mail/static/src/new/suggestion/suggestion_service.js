/* @odoo-module */

import { cleanTerm } from "@mail/new/utils/format";
import { CannedResponse } from "../core/canned_response_model";
import { Partner } from "../core/partner_model";
import { Thread } from "../core/thread_model";
import { registry } from "@web/core/registry";

const commandRegistry = registry.category("mail.channel_commands");

class SuggestionService {
    constructor(env, messaging, orm) {
        this.orm = orm;
        this.messaging = messaging;
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
            Partner.insert(this.messaging.state, data);
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
            Thread.insert(this.messaging.state, {
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
                return Partner.searchSuggestions(
                    this.messaging.state,
                    cleanedSearchTerm,
                    thread,
                    sort
                );
            }
            case ":":
                return CannedResponse.searchSuggestions(
                    this.messaging.state,
                    cleanedSearchTerm,
                    sort
                );
            case "#":
                return Thread.searchSuggestions(
                    this.messaging.state,
                    cleanedSearchTerm,
                    thread,
                    sort
                );
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
}

export const suggestionService = {
    dependencies: ["orm", "mail.messaging"],
    start(env, { orm, "mail.messaging": messaging }) {
        return new SuggestionService(env, messaging, orm);
    },
};
