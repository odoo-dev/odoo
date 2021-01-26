odoo.define('mail/static/src/models/suggestion_manager/suggestion_manager.js', function (require) {
'use strict';

const { registerNewModel } = require('mail/static/src/model/model_core.js');
const { attr, many2many, many2one, one2one } = require('mail/static/src/model/model_field.js');

function factory(dependencies) {

    class SuggestionManager extends dependencies['mail.model'] {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        closeSuggestions() {
            if (this.activeSuggestedRecordName) {
                this.update({
                    [this.activeSuggestedRecordName]: [['unlink']],
                });
            }
            if (this.extraSuggestedRecordsListName) {
                this.update({
                    [this.extraSuggestedRecordsListName]: [['unlink-all']],
                });
            }
            if (this.mainSuggestedRecordsListName) {
                this.update({
                    [this.mainSuggestedRecordsListName]: [['unlink-all']],
                });
            }
            this.update({
                activeSuggestedRecordName: "",
                extraSuggestedRecordsListName: "",
                mainSuggestedRecordsListName: "",
                suggestionDelimiter: "",
            });
        }

        detectSuggestionDelimiter() {
            if (this.textInputCursorStart !== this.textInputCursorEnd) {
                return;
            }

            const lastInputChar = this.textInputContent.substring(this.textInputCursorStart - 1, this.textInputCursorStart);
            const suggestionDelimiters = ['@', ':', '#', '/'];
            if (suggestionDelimiters.includes(lastInputChar) && !this.hasSuggestions) {
                this.update({ suggestionDelimiter: lastInputChar });
            }
            const mentionKeyword = this._validateMentionKeyword(false);
            if (mentionKeyword !== false) {
                switch (this.suggestionDelimiter) {
                    case '@':
                        this.update({
                            activeSuggestedRecordName: "activeSuggestedPartner",
                            extraSuggestedRecordsListName: "extraSuggestedPartners",
                            mainSuggestedRecordsListName: "mainSuggestedPartners",
                            suggestionModelName: "mail.partner",
                        });
                        this._executeOrQueueFunction(() => this._updateSuggestedPartners(mentionKeyword));
                        break;
                    case ':':
                        this.update({
                            activeSuggestedRecordName: "activeSuggestedCannedResponse",
                            mainSuggestedRecordsListName: "suggestedCannedResponses",
                            suggestionModelName: "mail.canned_response",
                        });
                        this._executeOrQueueFunction(() => this._updateSuggestedCannedResponses(mentionKeyword));
                        break;
                    case '/':
                        this.update({
                            activeSuggestedRecordName: "activeSuggestedChannelCommand",
                            mainSuggestedRecordsListName: "suggestedChannelCommands",
                            suggestionModelName: "mail.channel_command",
                        });
                        this._executeOrQueueFunction(() => this._updateSuggestedChannelCommands(mentionKeyword));
                        break;
                    case '#':
                        this.update({
                            activeSuggestedRecordName: "activeSuggestedChannel",
                            mainSuggestedRecordsListName: "suggestedChannels",
                            suggestionModelName: "mail.thread",
                        });
                        this._executeOrQueueFunction(() => this._updateSuggestedChannels(mentionKeyword));
                        break;
                }
            } else {
                this.closeSuggestions();
            }
        }

        setFirstSuggestionActive() {
            if (!this[this.mainSuggestedRecordsListName][0]) {
                if (!this[this.extraSuggestedRecordsListName][0]) {
                    return;
                }
                this.update({
                    [this.activeSuggestedRecordName]: [['link', this[this.extraSuggestedRecordsListName][0]]],
                });
            } else {
                this.update({
                    [this.activeSuggestedRecordName]: [['link', this[this.mainSuggestedRecordsListName][0]]],
                });
            }
        }

        setLastSuggestionActive() {
            if (this[this.extraSuggestedRecordsListName].length === 0) {
                if (this[this.mainSuggestedRecordsListName].length === 0) {
                    return;
                }
                this.update({
                    [this.activeSuggestedRecordName]: [[
                        'link',
                        this[this.mainSuggestedRecordsListName][this[this.mainSuggestedRecordsListName].length - 1]
                    ]],
                });
                return;
            }
            this.update({
                [this.activeSuggestedRecordName]: [[
                    'link',
                    this[this.extraSuggestedRecordsListName][this[this.extraSuggestedRecordsListName].length - 1]
                ]],
            });
        }

        setNextSuggestionActive() {
            const fullList = this.extraSuggestedRecordsListName ?
                this[this.mainSuggestedRecordsListName].concat(this[this.extraSuggestedRecordsListName]) :
                this[this.mainSuggestedRecordsListName];
            if (fullList.length === 0) {
                return;
            }
            const activeElementIndex = fullList.findIndex(
                suggestion => suggestion === this[this.activeSuggestedRecordName]
            );
            if (activeElementIndex !== fullList.length - 1) {
                this.update({
                    [this.activeSuggestedRecordName]: [[
                        'link',
                        fullList[activeElementIndex + 1]
                    ]],
                });
            } else {
                this.update({
                    [this.activeSuggestedRecordName]: [['link', fullList[0]]],
                });
            }
        }

        setPreviousSuggestionActive() {
            const fullList = this.extraSuggestedRecordsListName ?
                this[this.mainSuggestedRecordsListName].concat(this[this.extraSuggestedRecordsListName]) :
                this[this.mainSuggestedRecordsListName];
            if (fullList.length === 0) {
                return;
            }
            const activeElementIndex = fullList.findIndex(
                suggestion => suggestion === this[this.activeSuggestedRecordName]
            );
            if (activeElementIndex === -1) {
                this.update({
                    [this.activeSuggestedRecordName]: [['link', fullList[0]]]
                });
            } else if (activeElementIndex !== 0) {
                this.update({
                    [this.activeSuggestedRecordName]: [[
                        'link',
                        fullList[activeElementIndex - 1]
                    ]],
                });
            } else {
                this.update({
                    [this.activeSuggestedRecordName]: [[
                        'link',
                        fullList[fullList.length - 1]
                    ]],
                });
            }
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         * @returns {mail.model[]}
         */
        _computeMainSuggestedRecordsList() {
            return this.mainSuggestedRecordsListName
                ? this[this.mainSuggestedRecordsListName]
                : [];
        }

        /**
         * @private
         * @return {boolean}
         */
        _computeHasSuggestions() {
            const hasMainSuggestedRecordsList = this.mainSuggestedRecordsListName ? this[this.mainSuggestedRecordsListName].length > 0 : false;
            const hasExtraSuggestedRecordsList = this.extraSuggestedRecordsListName ? this[this.extraSuggestedRecordsListName].length > 0 : false;
            return hasMainSuggestedRecordsList || hasExtraSuggestedRecordsList;
        }

        /**
         * @private
         * @returns {mail.model[]}
         */
        _computeExtraSuggestedRecordsList() {
            return this.extraSuggestedRecordsListName
                ? this[this.extraSuggestedRecordsListName]
                : [];
        }

        /**
         * @private
         * @returns {mail.model}
         */
        _computeActiveSuggestedRecord() {
            return this[this.activeSuggestedRecordName];
        }

        /**
         * Ensure extraSuggestedPartners does not contain any partner already
         * present in mainSuggestedPartners. This is necessary for the
         * consistency of suggestion list.
         *
         * @private
         * @returns {mail.partner[]}
         */
        _computeExtraSuggestedPartners() {
            return [['unlink', this.mainSuggestedPartners]];
        }

        /**
         * Executes the given async function, only when the last function
         * executed by this method terminates. If there is already a pending
         * function it is replaced by the new one. This ensures the result of
         * these function come in the same order as the call order, and it also
         * allows to skip obsolete intermediate calls.
         *
         * @private
         * @param {function} func
         */
        async _executeOrQueueFunction(func) {
            if (this._hasMentionRpcInProgress) {
                this._nextMentionRpcFunction = func;
                return;
            }
            this._hasMentionRpcInProgress = true;
            this._nextMentionRpcFunction = undefined;
            try {
                await this.async(func);
            } finally {
                this._hasMentionRpcInProgress = false;
                if (this._nextMentionRpcFunction) {
                    this._executeOrQueueFunction(this._nextMentionRpcFunction);
                }
            }
        }

        /**
         * @private
         * @param {string} mentionKeyword
         */
        _updateSuggestedCannedResponses(mentionKeyword) {
            this.update({
                suggestedCannedResponses: [['replace', this.env.messaging.cannedResponses.filter(
                    cannedResponse => cannedResponse.source.includes(mentionKeyword)
                )]],
            });

            if (this.suggestedCannedResponses[0]) {
                this.update({
                    activeSuggestedCannedResponse: [['link', this.suggestedCannedResponses[0]]],
                    hasToScrollToActiveSuggestion: true,
                });
            } else {
                this.update({
                    activeSuggestedCannedResponse: [['unlink']],
                });
            }
        }

        /**
         * @private
         * @param {string} mentionKeyword
         */
        async _updateSuggestedChannels(mentionKeyword) {
            const mentions = await this.async(() => this.env.services.rpc(
                {
                    model: 'mail.channel',
                    method: 'get_mention_suggestions',
                    kwargs: {
                        limit: 8,
                        search: mentionKeyword,
                    },
                },
                { shadow: true }
            ));

            this.update({
                suggestedChannels: [[
                    'insert-and-replace',
                    mentions.map(data => {
                        const threadData = this.env.models['mail.thread'].convertData(data);
                        return Object.assign({ model: 'mail.channel' }, threadData);
                    })
                ]],
            });

            if (this.suggestedChannels[0]) {
                this.update({
                    activeSuggestedChannel: [['link', this.suggestedChannels[0]]],
                    hasToScrollToActiveSuggestion: true,
                });
            } else {
                this.update({
                    activeSuggestedChannel: [['unlink']],
                });
            }
        }

        /**
         * @param {string} mentionKeyword
         */
        _updateSuggestedChannelCommands(mentionKeyword) {
            const commands = this.env.messaging.commands.filter(command => {
                if (!command.name.includes(mentionKeyword)) {
                    return false;
                }
                if (command.channel_types && this.thread) {
                    return command.channel_types.includes(this.thread.channel_type);
                }
                return true;
            });
            this.update({ suggestedChannelCommands: [['replace', commands]] });
            if (this.suggestedChannelCommands[0]) {
                this.update({
                    activeSuggestedChannelCommand: [['link', this.suggestedChannelCommands[0]]],
                    hasToScrollToActiveSuggestion: true,
                });
            } else {
                this.update({
                    activeSuggestedChannelCommand: [['unlink']],
                });
            }
        }

        /**
         * @private
         * @param {string} mentionKeyword
         */
        async _updateSuggestedPartners(mentionKeyword) {
            const mentions = await this.async(() => this.env.services.rpc(
                {
                    model: 'res.partner',
                    method: 'get_mention_suggestions',
                    kwargs: {
                        limit: 8,
                        search: mentionKeyword,
                    },
                },
                { shadow: true }
            ));

            const mainSuggestedPartners = mentions[0];
            const extraSuggestedPartners = mentions[1];
            this.update({
                extraSuggestedPartners: [[
                    'insert-and-replace',
                    extraSuggestedPartners.map(data =>
                        this.env.models['mail.partner'].convertData(data)
                    )
                ]],
                mainSuggestedPartners: [[
                    'insert-and-replace',
                    mainSuggestedPartners.map(data =>
                        this.env.models['mail.partner'].convertData(data))
                    ]],
            });

            if (this.mainSuggestedPartners[0]) {
                this.update({
                    activeSuggestedPartner: [['link', this.mainSuggestedPartners[0]]],
                    hasToScrollToActiveSuggestion: true,
                });
            } else if (this.extraSuggestedPartners[0]) {
                this.update({
                    activeSuggestedPartner: [['link', this.extraSuggestedPartners[0]]],
                    hasToScrollToActiveSuggestion: true,
                });
            } else {
                this.update({
                    activeSuggestedPartner: [['unlink']],
                });
            }
        }

        /**
         * Validates user's current typing as a correct mention keyword in order
         * to trigger mentions suggestions display.
         * Returns the mention keyword without the suggestion delimiter if it
         * has been validated and false if not.
         *
         * @private
         * @param {boolean} beginningOnly
         * @returns {string|boolean}
         */
        _validateMentionKeyword(beginningOnly) {
            const leftString = this.textInputContent.substring(0, this.textInputCursorStart);

            // use position before suggestion delimiter because there should be whitespaces
            // or line feed/carriage return before the suggestion delimiter
            const beforeSuggestionDelimiterPosition = leftString.lastIndexOf(this.suggestionDelimiter) - 1;
            if (beginningOnly && beforeSuggestionDelimiterPosition > 0) {
                return false;
            }
            let searchStr = this.textInputContent.substring(
                beforeSuggestionDelimiterPosition,
                this.textInputCursorStart
            );
            // regex string start with suggestion delimiter or whitespace then suggestion delimiter
            const pattern = "^" + this.suggestionDelimiter + "|^\\s" + this.suggestionDelimiter;
            const regexStart = new RegExp(pattern, 'g');
            // trim any left whitespaces or the left line feed/ carriage return
            // at the beginning of the string
            searchStr = searchStr.replace(/^\s\s*|^[\n\r]/g, '');
            if (regexStart.test(searchStr) && searchStr.length) {
                searchStr = searchStr.replace(pattern, '');
                return !searchStr.includes(' ') && !/[\r\n]/.test(searchStr)
                    ? searchStr.replace(this.suggestionDelimiter, '')
                    : false;
            }
            return false;
        }

    }

    SuggestionManager.fields = {
        activeSuggestedCannedResponse: many2one('mail.canned_response'),
        activeSuggestedChannel: many2one('mail.thread'),
        activeSuggestedChannelCommand: many2one('mail.channel_command'),
        activeSuggestedPartner: many2one('mail.partner'),
        activeSuggestedRecord: attr({
            compute: '_computeActiveSuggestedRecord',
            dependencies: [
                'activeSuggestedCannedResponse',
                'activeSuggestedChannel',
                'activeSuggestedChannelCommand',
                'activeSuggestedPartner',
                'activeSuggestedRecordName',
            ],
        }),
        activeSuggestedRecordName: attr({
            default: "",
        }),
        extraSuggestedPartners: many2many('mail.partner', {
            compute: '_computeExtraSuggestedPartners',
            dependencies: [
                'extraSuggestedPartners',
                'mainSuggestedPartners',
            ],
        }),
        extraSuggestedRecordsList: attr({
            compute: '_computeExtraSuggestedRecordsList',
            dependencies: [
                'extraSuggestedPartners',
                'extraSuggestedRecordsListName',
            ],
        }),
        /**
         * Allows to have different model types of mentions through a dynamic process
         * RPC can provide 2 lists and the second is defined as "extra"
         */
        extraSuggestedRecordsListName: attr({
            default: "",
        }),
        hasSuggestions: attr({
            compute: '_computeHasSuggestions',
            dependencies: [
                'extraSuggestedRecordsListName',
                'extraSuggestedPartners',
                'mainSuggestedRecordsListName',
                'mainSuggestedPartners',
                'suggestedCannedResponses',
                'suggestedChannelCommands',
                'suggestedChannels',
            ],
            default: false,
        }),
        /**
         * Determines whether the currently active suggestion should be scrolled
         * into view.
         */
        hasToScrollToActiveSuggestion: attr({
            default: false,
        }),
        suggestedCannedResponses: many2many('mail.canned_response'),
        suggestedChannelCommands: many2many('mail.channel_command'),
        suggestedChannels: many2many('mail.thread'),
        /**
         * Special character used to trigger different kinds of suggestions
         * such as canned responses (:), channels (#), commands (/) and partners (@)
         */
        suggestionDelimiter: attr({
            default: "",
        }),
        suggestionModelName: attr({
            default: "",
        }),
        /**
         * Allows to have different model types of mentions through a dynamic process
         * RPC can provide 2 lists and the first is defined as "main"
         */
        mainSuggestedRecordsListName: attr({
            default: "",
        }),
        mainSuggestedPartners: many2many('mail.partner'),
        mainSuggestedRecordsList: attr({
            compute: '_computeMainSuggestedRecordsList',
            dependencies: [
                'mainSuggestedPartners',
                'mainSuggestedRecordsListName',
                'suggestedCannedResponses',
                'suggestedChannelCommands',
                'suggestedChannels',
            ],
        }),
        /**
         * This will contain the text to analyse
         */
        textInputContent: attr({
            default: "",
        }),
        textInputCursorEnd: attr({
            default: 0,
        }),
        textInputCursorStart: attr({
            default: 0,
        }),
        textInputSelectionDirection: attr({
            default: "none",
        }),
        thread: one2one('mail.thread')
    };

    SuggestionManager.modelName = 'mail.suggestionManager';

    return SuggestionManager;
}

registerNewModel('mail.suggestionManager', factory);

});
