odoo.define('mail.messaging.entity.Composer', function (require) {
'use strict';

const emojis = require('mail.emojis');
const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr, many2many, one2one } = require('mail.messaging.EntityField');

const {
    addLink,
    escapeAndCompactTextContent,
    parseAndTransform,
} = require('mail.utils');

function ComposerFactory({ Entity }) {

    class Composer extends Entity {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        discard() {
            const discuss = this.env.messaging.discuss;
            const thread = this.thread;
            if (
                !discuss.isOpen ||
                discuss.thread !== thread ||
                !discuss.isReplyingToMessage
            ) {
                return;
            }
            discuss.clearReplyingToMessage();
        }

        /**
         * Inserts text content in text input based on selection.
         *
         * @param {string} content
         */
        insertIntoTextInput(content) {
            const partA = this.textInputContent.slice(0, this.textInputCursorStart);
            const partB = this.textInputContent.slice(
                this.textInputCursorEnd,
                this.textInputContent.length
            );
            this.update({
                textInputContent: partA + content + partB,
                textInputCursorStart: this.textInputCursorStart + content.length,
                textInputCursorEnd: this.textInputCursorStart + content.length,
            });
        }

        /**
         * Post a message in provided composer's thread with given data.
         *
         * @param {Object} data
         * @param {string[]} data.attachments
         * @param {*[]} data.canned_response_ids
         * @param {integer[]} data.channel_ids
         * @param {boolean} [data.isLog=false]
         * @param {string} data.subject
         * @param {integer} [data.subtype_id]
         * @param {string} [data.subtype_xmlid='mail.mt_comment']
         * @param {Object} [options]
         * @param {integer} options.res_id
         * @param {string} options.res_model
         */
        async postMessage(data, options) {
            const thread = this.thread;
            this.thread.unregisterCurrentPartnerIsTyping({ immediateNotify: true });
            if (thread.model === 'mail.box') {
                const { res_id, res_model } = options;
                const otherThread = this.env.entities.Thread.find(thread =>
                    thread.id === res_id &&
                    thread.model === res_model
                );
                return otherThread.composer.postMessage(Object.assign({}, data));
            }
            const {
                canned_response_ids,
                channel_ids = [],
                context,
                isLog = false,
                subject,
                subtype_id,
                // subtype_xmlid='mail.mt_comment',
            } = data;
            const escapedAndCompactContent = escapeAndCompactTextContent(this.textInputContent);
            let body = escapedAndCompactContent.replace(/&nbsp;/g, ' ').trim();
            // This message will be received from the mail composer as html content
            // subtype but the urls will not be linkified. If the mail composer
            // takes the responsibility to linkify the urls we end up with double
            // linkification a bit everywhere. Ideally we want to keep the content
            // as text internally and only make html enrichment at display time but
            // the current design makes this quite hard to do.
            body = parseAndTransform(body, addLink);
            body = this._generateEmojisOnHtml(body);
            let postData = {
                attachment_ids: this.attachments.map(attachment => attachment.id),
                body,
                partner_ids: this._getMentionedPartnerIdsFromHtml(body),
                message_type: 'comment',
            };
            let messageId;
            if (thread.model === 'mail.channel') {
                const command = this._getCommandFromText(body);
                Object.assign(postData, {
                    command,
                    subtype_xmlid: 'mail.mt_comment'
                });
                messageId = await this.async(() => this.env.rpc({
                    model: 'mail.channel',
                    method: command ? 'execute_command' : 'message_post',
                    args: [thread.id],
                    kwargs: postData
                }));
            } else {
                Object.assign(postData, {
                    channel_ids: channel_ids.map(channelId => [4, channelId, false]),
                    canned_response_ids
                });
                if (subject) {
                    postData.subject = subject;
                }
                Object.assign(postData, {
                    context,
                    subtype_id,
                    subtype_xmlid: isLog ? 'mail.mt_note' : 'mail.mt_comment',
                });
                messageId = await this.async(() => this.env.rpc({
                    model: thread.model,
                    method: 'message_post',
                    args: [thread.id],
                    kwargs: postData
                }));
                const [messageData] = await this.async(() => this.env.rpc({
                    model: 'mail.message',
                    method: 'message_format',
                    args: [[messageId]]
                }));
                this.env.entities.Message.insert(Object.assign(
                    {},
                    this.env.entities.Message.convertData(messageData),
                    {
                        originThread: [['insert', {
                            id: thread.id,
                            model: thread.model,
                        }]],
                    })
                );
                thread.loadNewMessages();
            }
            for (const threadViewer of this.thread.viewers) {
                threadViewer.addComponentHint('current-partner-just-posted-message', messageId);
            }
            this._reset();
        }

        /**
         * Called when current partner is inserting some input in composer.
         * Useful to notify current partner is currently typing something in the
         * composer of this thread to all other members.
         */
        handleCurrentPartnerIsTyping() {
            if (!this.thread) {
                return;
            }
            if (this.thread.typingMembers.includes(this.env.messaging.currentPartner)) {
                this.thread.refreshCurrentPartnerIsTyping();
            } else {
                this.thread.registerCurrentPartnerIsTyping();
            }
        }

        /**
         * @param {Object} param0
         * @param {string} param0.textInputContent
         * @param {integer} param0.textInputCursorEnd
         * @param {integer} param0.textInputCursorStart
         */
        saveTextInput({ textInputContent, textInputCursorEnd, textInputCursorStart }) {
            this.update({ textInputContent, textInputCursorEnd, textInputCursorStart });
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         * @param {string} htmlString
         * @returns {string}
         */
        _generateEmojisOnHtml(htmlString) {
            for (const emoji of emojis) {
                for (const source of emoji.sources) {
                    const escapedSource = String(source).replace(
                        /([.*+?=^!:${}()|[\]/\\])/g,
                        '\\$1');
                    const regexp = new RegExp(
                        '(\\s|^)(' + escapedSource + ')(?=\\s|$)',
                        'g');
                    htmlString = htmlString.replace(regexp, '$1' + emoji.unicode);
                }
            }
            return htmlString;
        }

        /**
         *
         * @private
         * @param {string} content html content
         * @returns {String|undefined} command, if any in the content
         */
        _getCommandFromText(content) {
            if (content.startsWith('/')) {
                return content.substring(1).split(/\s/)[0];
            }
            return undefined;
        }

        /**
         * @private
         * @param {string} content html content
         * @returns {integer[]} list of mentioned partner Ids (not duplicate)
         */
        _getMentionedPartnerIdsFromHtml(content) {
            const parser = new window.DOMParser();
            const node = parser.parseFromString(content, 'text/html');
            const mentions = [...node.querySelectorAll('.o_mention')];
            const allPartnerIds = mentions
                .filter(mention =>
                    (
                        mention.dataset.oeModel === 'res.partner' &&
                        !isNaN(Number(mention.dataset.oeId))
                    )
                )
                .map(mention => Number(mention.dataset.oeId));
            return [...new Set(allPartnerIds)];
        }

        /**
         * @private
         */
        _reset() {
            this.update({
                attachments: [['unlink-all']],
                textInputContent: '',
                textInputCursorStart: 0,
                textInputCursorEnd: 0,
            });
        }

    }

    Composer.entityName = 'Composer';

    Composer.fields = {
        attachments: many2many('Attachment', {
            inverse: 'composers',
        }),
        textInputContent: attr({
            default: "",
        }),
        textInputCursorStart: attr({
            default: 0,
        }),
        textInputCursorEnd: attr({
            default: 0,
        }),
        thread: one2one('Thread', {
            inverse: 'composer',
        }),
    };

    return Composer;
}

registerNewEntity('Composer', ComposerFactory);

});
