odoo.define('mail.messaging.entity.Discuss', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr, many2one, one2many, one2one } = require('mail.messaging.EntityField');

function DiscussFactory({ Entity }) {

    class Discuss extends Entity {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * @param {mail.messaging.entity.Thread} thread
         */
        cancelThreadRenaming(thread) {
            this.update({ renamingThreads: [['unlink', thread]] });
        }

        clearIsAddingItem() {
            this.update({
                addingChannelValue: "",
                isAddingChannel: false,
                isAddingChat: false,
            });
        }

        clearReplyingToMessage() {
            this.update({ replyingToMessage: [['unlink-all']] });
        }

        /**
         * Close the discuss app. Should reset its internal state.
         */
        close() {
            this.update({ isOpen: false });
        }

        /**
         * @param {Event} ev
         * @param {Object} ui
         * @param {Object} ui.item
         * @param {integer} ui.item.id
         */
        handleAddChannelAutocompleteSelect(ev, ui) {
            if (ui.item.special) {
                this.env.entities.Thread.createChannel({
                    autoselect: true,
                    name: this.addingChannelValue,
                    public: ui.item.special,
                    type: 'channel',
                });
            } else {
                this.env.entities.Thread.joinChannel(ui.item.id, { autoselect: true });
            }
            this.clearIsAddingItem();
        }

        /**
         * @param {Object} req
         * @param {string} req.term
         * @param {function} res
         */
        async handleAddChannelAutocompleteSource(req, res) {
            const value = _.escape(req.term);
            this.update({ addingChannelValue: value });
            const result = await this.async(() => this.env.rpc({
                model: 'mail.channel',
                method: 'channel_search_to_join',
                args: [value],
            }));
            const items = result.map(data => {
                let escapedName = _.escape(data.name);
                return Object.assign(data, {
                    label: escapedName,
                    value: escapedName
                });
            });
            // AKU FIXME
            items.push({
                label: this.env.qweb.renderToString(
                    'mail.messaging.component.Discuss.AutocompleteChannelPublicItem',
                    { searchVal: value }
                ),
                value,
                special: 'public'
            }, {
                label: this.env.qweb.renderToString(
                    'mail.messaging.component.Discuss.AutocompleteChannelPrivateItem',
                    { searchVal: value }
                ),
                value,
                special: 'private'
            });
            res(items);
        }

        /**
         * @param {Event} ev
         * @param {Object} ui
         * @param {Object} ui.item
         * @param {integer} ui.item.id
         */
        handleAddChatAutocompleteSelect(ev, ui) {
            const partnerId = ui.item.id;
            const partner = this.env.entities.Partner.find(partner =>
                partner.id === partnerId
            );
            const chat = partner.correspondentThreads.find(thread => thread.channel_type === 'chat');
            if (chat) {
                this.threadViewer.update({ thread: [['link', chat]] });
            } else {
                this.env.entities.Thread.createChannel({
                    autoselect: true,
                    partnerId,
                    type: 'chat',
                });
            }
            this.clearIsAddingItem();
        }

        /**
         * @param {Object} req
         * @param {string} req.term
         * @param {function} res
         */
        handleAddChatAutocompleteSource(req, res) {
            const value = _.escape(req.term);
            this.env.entities.Partner.imSearch({
                callback: partners => {
                    const suggestions = partners.map(partner => {
                        return {
                            id: partner.id,
                            value: partner.nameOrDisplayName,
                            label: partner.nameOrDisplayName,
                        };
                    });
                    res(_.sortBy(suggestions, 'label'));
                },
                keyword: value,
                limit: 10,
            });
        }

        /**
         * @param {Object} param0
         * @param {function} param0.dispatch
         * @param {Object} param0.getters
         */
        openInitThread() {
            const [model, id] = this.initActiveId.split('_');
            const thread = this.env.entities.Thread.find(thread =>
                thread.id === (model !== 'mail.box' ? Number(id) : id) &&
                thread.model === model
            );
            if (!thread) {
                return;
            }
            this.threadViewer.update({
                stringifiedDomain: '[]',
                thread: [['link', thread]],
            });
            thread.open({ resetDiscussDomain: true });
        }

        /**
         * @param {mail.messaging.entity.Thread} thread
         * @param {string} newName
         */
        async renameThread(thread, newName) {
            await this.async(() => thread.rename(newName));
            this.update({ renamingThreads: [['unlink', thread]] });
        }

        /**
         * @param {mail.messaging.entity.Thread} thread
         */
        setThreadRenaming(thread) {
            this.update({ renamingThreads: [['link', thread ]] });
        }

        /**
         * @param {mail.messaging.entity.Thread} thread
         * @returns {string}
         */
        threadToActiveId(thread) {
            return `${thread.model}_${thread.id}`;
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         * @returns {string|undefined}
         */
        _computeActiveId() {
            if (!this.thread) {
                return undefined;
            }
            return this.threadToActiveId(this.thread);
        }

        /**
         * @private
         * @returns {string}
         */
        _computeAddingChannelValue() {
            if (!this.isOpen) {
                return "";
            }
            return this.addingChannelValue;
        }

        /**
         * @private
         * @returns {string}
         */
        _computeInitActiveId() {
            if (!this.isOpen) {
                return this.defaultInitActiveId;
            }
            if (this.thread) {
                return this.threadToActiveId(this.thread);
            }
            return this.initActiveId;
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeIsAddingChannel() {
            if (!this.isOpen) {
                return false;
            }
            return this.isAddingChannel;
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeIsAddingChat() {
            if (!this.isOpen) {
                return false;
            }
            return this.isAddingChat;
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeIsReplyingToMessage() {
            return !!this.replyingToMessage;
        }

        /**
         * @private
         * @returns {mail.messaging.entity.Message|undefined}
         */
        _computeReplyingToMessage() {
            if (!this.isOpen) {
                return [['unlink-all']];
            }
            return [];
        }

    }

    Discuss.entityName = 'Discuss';

    Discuss.fields = {
        activeId: attr({
            compute: '_computeActiveId',
            dependencies: [
                'thread',
                'threadId',
                'threadModel',
            ],
        }),
        /**
         * Active mobile navbar tab, either 'mailbox', 'chat', or 'channel'.
         */
        activeMobileNavbarTabId: attr({
            default: 'mailbox',
        }),
        /**
         * Value that is used to create a channel from the sidebar.
         */
        addingChannelValue: attr({
            compute: '_computeAddingChannelValue',
            default: "",
            dependencies: ['isOpen'],
        }),
        defaultInitActiveId: attr({
            default: 'mail.box_inbox',
        }),
        /**
         * Determine if the moderation discard dialog is displayed.
         */
        hasModerationDiscardDialog: attr({
            default: false,
        }),
        /**
         * Determine if the moderation reject dialog is displayed.
         */
        hasModerationRejectDialog: attr({
            default: false,
        }),
        /**
         * Formatted init thread on opening discuss for the first time,
         * when no active thread is defined. Useful to set a thread to
         * open without knowing its local id in advance.
         * format: <threadModel>_<threadId>
         */
        initActiveId: attr({
            compute: '_computeInitActiveId',
            default: 'mail.box_inbox',
            dependencies: [
                'isOpen',
                'thread',
                'threadId',
                'threadModel',
            ],
        }),
        /**
         * Determine whether current user is currently adding a channel from
         * the sidebar.
         */
        isAddingChannel: attr({
            compute: '_computeIsAddingChannel',
            default: false,
            dependencies: ['isOpen'],
        }),
        /**
         * Determine whether current user is currently adding a chat from
         * the sidebar.
         */
        isAddingChat: attr({
            compute: '_computeIsAddingChat',
            default: false,
            dependencies: ['isOpen'],
        }),
        /**
         * Whether the discuss app is open or not. Useful to determine
         * whether the discuss or chat window logic should be applied.
         */
        isOpen: attr({
            default: false,
        }),
        isReplyingToMessage: attr({
            compute: '_computeIsReplyingToMessage',
            default: false,
            dependencies: ['replyingToMessage'],
        }),
        /**
         * The menu_id of discuss app, received on mail/init_messaging and
         * used to open discuss from elsewhere.
         */
        menu_id: attr({
            default: null,
        }),
        renamingThreads: one2many('Thread'),
        replyingToMessage: one2one('Message', {
            compute: '_computeReplyingToMessage',
            dependencies: ['isOpen'],
        }),
        /**
         * Quick search input value in the discuss sidebar (desktop). Useful
         * to filter channels and chats based on this input content.
         */
        sidebarQuickSearchValue: attr({
            default: "",
        }),
        thread: many2one('Thread', {
            related: 'threadViewer.thread',
        }),
        threadId: attr({
            related: 'thread.id',
        }),
        threadModel: attr({
            related: 'thread.model',
        }),
        threadViewer: one2one('ThreadViewer', {
            autocreate: true,
            isCausal: true,
        }),
    };

    return Discuss;
}

registerNewEntity('Discuss', DiscussFactory);

});
