/* @odoo-module */

import { useMessaging } from "../messaging_hook";
import { useComponent, useEffect, useState } from "@odoo/owl";

export function useSuggestion() {
    const messaging = useMessaging();
    const comp = useComponent();
    const self = {
        clearRawMentions() {
            self.rawMentions.partnerIds.length = 0;
            self.rawMentions.threadIds.length = 0;
        },
        clearSearch() {
            Object.assign(self.search, {
                delimiter: undefined,
                position: undefined,
                term: undefined,
            });
            self.state.items.length = [];
        },
        detect() {
            const selectionEnd = comp.props.composer.selection.end;
            const selectionStart = comp.props.composer.selection.start;
            const content = comp.props.composer.textInputContent;
            if (selectionStart !== selectionEnd) {
                // avoid interfering with multi-char selection
                self.clearSearch();
            }
            const candidatePositions = [];
            // keep the current delimiter if it is still valid
            if (self.search.position !== undefined && self.search.position < selectionStart) {
                candidatePositions.push(self.search.position);
            }
            // consider the char before the current cursor position if the
            // current delimiter is no longer valid (or if there is none)
            if (selectionStart > 0) {
                candidatePositions.push(selectionStart - 1);
            }
            const suggestionDelimiters = ["@", ":", "#", "/"];
            for (const candidatePosition of candidatePositions) {
                if (candidatePosition < 0 || candidatePosition >= content.length) {
                    continue;
                }
                const candidateChar = content[candidatePosition];
                if (candidateChar === "/" && candidatePosition !== 0) {
                    continue;
                }
                if (!suggestionDelimiters.includes(candidateChar)) {
                    continue;
                }
                const charBeforeCandidate = content[candidatePosition - 1];
                if (charBeforeCandidate && !/\s/.test(charBeforeCandidate)) {
                    continue;
                }
                Object.assign(self.search, {
                    delimiter: candidateChar,
                    position: candidatePosition,
                    term: content.substring(candidatePosition + 1, selectionStart),
                });
                self.state.count++;
                return;
            }
            self.clearSearch();
        },
        fetch: {
            inProgress: false,
            rpcFunction: undefined,
        },
        insert(option) {
            const cursorPosition = comp.props.composer.selection.start;
            const content = comp.props.composer.textInputContent;
            let textLeft = content.substring(0, self.search.position + 1);
            let textRight = content.substring(cursorPosition, content.length);
            if (self.search.delimiter === ":") {
                textLeft = content.substring(0, self.search.position);
                textRight = content.substring(cursorPosition, content.length);
            }
            const recordReplacement = option.label;
            if (option.partner) {
                self.rawMentions.partnerIds.add(option.partner.id);
            }
            if (option.thread) {
                self.rawMentions.threadIds.add(option.thread.id);
            }
            self.clearSearch();
            comp.props.composer.textInputContent = textLeft + recordReplacement + " " + textRight;
            comp.props.composer.selection.start = textLeft.length + recordReplacement.length + 1;
            comp.props.composer.selection.end = textLeft.length + recordReplacement.length + 1;
            comp.props.composer.forceCursorMove = true;
        },
        async process(func) {
            if (self.fetch.inProgress) {
                self.fetch.rpcFunction = func;
                return;
            }
            self.fetch.inProgress = true;
            self.fetch.rpcFunction = undefined;
            await func();
            self.fetch.inProgress = false;
            if (self.fetch.nextMentionRpcFunction) {
                self.process(self.fetch.nextMentionRpcFunction);
            }
        },
        rawMentions: {
            partnerIds: new Set(),
            threadIds: new Set(),
        },
        search: {
            delimiter: undefined,
            position: undefined,
            term: undefined,
        },
        state: useState({
            count: 0,
            items: [],
        }),
        update() {
            if (!self.search.delimiter) {
                return;
            }
            const composer = comp.props.composer;
            const threadLocalId = composer.thread
                ? composer.thread.localId
                : composer.message.originThread.localId;
            const [main, extra = { suggestions: [] }] = messaging.searchSuggestions(
                self.search,
                { threadLocalId },
                true
            );
            // arbitrary limit to avoid displaying too many elements at once
            // ideally a load more mechanism should be introduced
            const limit = 8;
            main.suggestions.length = Math.min(main.suggestions.length, limit);
            extra.suggestions.length = Math.min(
                extra.suggestions.length,
                limit - main.suggestions.length
            );
            self.state.items = [main, extra];
        },
    };
    useEffect(
        () => {
            self.update();
            self.process(async () => {
                if (self.search.position === undefined || self.search.term === "") {
                    return; // ignore obsolete call
                }
                const composer = comp.props.composer;
                const threadLocalId = composer.thread
                    ? composer.thread.localId
                    : composer.message.originThread.localId;
                await messaging.fetchSuggestions(self.search, { threadLocalId });
                self.update();
            });
        },
        () => {
            return [self.search.delimiter, self.search.position, self.search.term];
        }
    );
    useEffect(
        () => {
            self.detect();
        },
        () => [
            comp.props.composer.selection.start,
            comp.props.composer.selection.end,
            comp.props.composer.textInputContent,
        ]
    );
    return self;
}
