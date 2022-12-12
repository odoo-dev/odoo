/* @odoo-module */

import { _t } from "@web/core/l10n/translation";
import { cleanTerm } from "@mail/new/utils/format";

export class CannedResponse {
    /** @type {number} */
    id;
    /** @type {string} */
    name;
    /** @type {string} */
    substitution;

    static insert(state, data) {
        let cannedResponse = state.cannedResponses[data.id];
        if (!cannedResponse) {
            state.cannedResponses[data.id] = new CannedResponse();
            cannedResponse = state.cannedResponses[data.id];
        }
        Object.assign(cannedResponse, {
            id: data.id,
            name: data.source,
            substitution: data.substitution,
        });
        return cannedResponse;
    }

    static searchSuggestions(state, cleanedSearchTerm, sort) {
        const cannedResponses = state.cannedResponses
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
}
