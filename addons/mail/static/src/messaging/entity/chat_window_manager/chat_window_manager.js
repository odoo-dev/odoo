odoo.define('mail.messaging.entity.ChatWindowManager', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr, many2one, one2many, one2one } = require('mail.messaging.EntityField');

function ChatWindowManagerFactory({ Entity }) {

    const BASE_VISUAL = {
        /**
         * Amount of visible slots available for chat windows.
         */
        availableVisibleSlots: 0,
        /**
         * Data related to the hidden menu.
         */
        hidden: {
            /**
             * List of hidden docked chat windows. Useful to compute counter.
             * Chat windows are ordered by their `chatWindows` order.
             */
            _chatWindows: [],
            /**
             * Whether hidden menu is visible or not
             */
            isVisible: false,
            /**
             * Offset of hidden menu starting point from the starting point
             * of chat window manager. Makes only sense if it is visible.
             */
            offset: 0,
        },
        /**
         * Data related to visible chat windows. Index determine order of
         * docked chat windows.
         *
         * Value:
         *
         *  {
         *      _chatWindow,
         *      offset,
         *  }
         *
         * Offset is offset of starting point of docked chat window from
         * starting point of dock chat window manager. Docked chat windows
         * are ordered by their `chatWindows` order
         */
        visible: [],
    };


    class ChatWindowManager extends Entity {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * Close all chat windows.
         *
         */
        closeAll() {
            const chatWindows = this.allOrdered;
            for (const chatWindow of chatWindows) {
                chatWindow.close();
            }
            this.update({ _ordered: [] });
        }

        openNewMessage() {
            if (!this.newMessageChatWindow) {
                const chatWindow = this.env.entities.ChatWindow.create({
                    manager: [['link', this]],
                });
                this.update({
                    _ordered: this._ordered.concat([chatWindow.localId]),
                });
            }
            this.newMessageChatWindow.makeVisible();
            this.newMessageChatWindow.focus();
        }

        /**
         * @param {mail.messaging.entity.Thread} thread
         * @param {Object} [param1={}]
         * @param {string} [param1.mode='last_visible']
         */
        openThread(thread, { mode = 'last_visible' } = {}) {
            if (thread.foldState === 'closed') {
                thread.update({ foldState: 'open' });
            }
            let chatWindow = this.env.entities.ChatWindow.find(chatWindow =>
                chatWindow.thread === thread
            );
            if (!chatWindow) {
                chatWindow = this.env.entities.ChatWindow.create({
                    manager: [['link', this]],
                    threadViewer: [['create', {
                        thread: [['link', thread]],
                    }]],
                });
                this.update({
                    _ordered: this._ordered.concat([chatWindow.localId]),
                });
            }
            if (mode === 'last_visible' && !chatWindow.isVisible) {
                chatWindow.makeVisible();
            }
            if (mode === 'from_new_message') {
                if (!this.newMessageChatWindow) {
                    throw new Error('Cannot open thread in chat window in mode "from_new_message" without any new message chat window');
                }
                this.swap(chatWindow, this.newMessageChatWindow);
                this.newMessageChatWindow.close();
            }
            chatWindow.focus();
        }

        /**
         * Shift provided chat window to the left on screen.
         *
         * @param {mail.messaging.entity.ChatWindow} chatWindow
         */
        shiftLeft(chatWindow) {
            const chatWindows = this.allOrdered;
            const index = chatWindows.findIndex(cw => cw === chatWindow);
            if (index === chatWindows.length - 1) {
                // already left-most
                return;
            }
            const otherChatWindow = chatWindows[index + 1];
            const _newOrdered = [...this._ordered];
            _newOrdered[index] = otherChatWindow.localId;
            _newOrdered[index + 1] = chatWindow.localId;
            this.update({ _ordered: _newOrdered });
            chatWindow.focus();
        }

        /**
         * Shift provided chat window to the right on screen.
         *
         * @param {mail.messaging.entity.ChatWindow} chatWindow
         */
        shiftRight(chatWindow) {
            const chatWindows = this.allOrdered;
            const index = chatWindows.findIndex(cw => cw === chatWindow);
            if (index === 0) {
                // already right-most
                return;
            }
            const otherChatWindow = chatWindows[index - 1];
            const _newOrdered = [...this._ordered];
            _newOrdered[index] = otherChatWindow.localId;
            _newOrdered[index - 1] = chatWindow.localId;
            this.update({ _ordered: _newOrdered });
            chatWindow.focus();
        }

        /**
         * @param {mail.messaging.entity.ChatWindow} chatWindow1
         * @param {mail.messaging.entity.ChatWindow} chatWindow2
         */
        swap(chatWindow1, chatWindow2) {
            const ordered = this.allOrdered;
            const index1 = ordered.findIndex(chatWindow => chatWindow === chatWindow1);
            const index2 = ordered.findIndex(chatWindow => chatWindow === chatWindow2);
            if (index1 === -1 || index2 === -1) {
                return;
            }
            const _newOrdered = [...this._ordered];
            _newOrdered[index1] = chatWindow2.localId;
            _newOrdered[index2] = chatWindow1.localId;
            this.update({ _ordered: _newOrdered });
        }

        toggleHiddenMenu() {
            this.update({ isHiddenMenuOpen: !this.isHiddenMenuOpen });
        }

        /**
         * @param {mail.messaging.entity.ChatWindow} chatWindow
         */
        unregister(chatWindow) {
            if (!this.allOrdered.includes(chatWindow)) {
                return;
            }
            this.update({
                _ordered: this._ordered.filter(
                    _chatWindow => _chatWindow !== chatWindow.localId
                ),
                chatWindows: [['unlink', chatWindow]],
            });
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * // FIXME: dependent on implementation that uses arbitrary order in relations!!
         *
         * @private
         * @returns {mail.messaging.entity.ChatWindow}
         */
        _computeAllOrdered() {
            return [['replace', this._ordered.map(_chatWindow => this.env.entities.ChatWindow.get(_chatWindow))]];
        }

        /**
         * @private
         * @returns {mail.messaging.entity.ChatWindow[]}
         */
        _computeAllOrderedHidden() {
            return this.visual.hidden._chatWindows.map(_chatWindow => this.env.entities.ChatWindow.get(_chatWindow));
        }

        /**
         * @private
         * @returns {mail.messaging.entity.ChatWindow[]}
         */
        _computeAllOrderedVisible() {
            return [['replace', this.visual.visible.map(({ _chatWindow }) => this.env.entities.ChatWindow.get(_chatWindow))]];
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeHasHiddenChatWindows() {
            return this.visual.hidden._chatWindows.length > 0;
        }

        /**
         * @private
         * @returns {boolean}
         */
        _computeHasVisibleChatWindows() {
            return this.visual.visible.length > 0;
        }

        /**
         * @private
         * @returns {mail.messaging.entity.ChatWindow|undefined}
         */
        _computeLastVisible() {
            const { length: l, [l - 1]: lastVisible } = this.allOrderedVisible;
            if (!lastVisible) {
                return [['unlink-all']];
            }
            return [['replace', lastVisible]];
        }

        /**
         * @private
         * @returns {mail.messaging.entity.ChatWindow|undefined}
         */
        _computeNewMessageChatWindow() {
            const chatWindow = this.allOrdered.find(chatWindow => !chatWindow.thread);
            if (!chatWindow) {
                return [];
            }
            return [['replace', chatWindow]];
        }

        /**
         * @private
         * @returns {integer}
         */
        _computeUnreadHiddenConversationAmount() {
            const allHiddenWithThread = this.allOrderedHidden.filter(
                chatWindow => chatWindow.thread
            );
            let amount = 0;
            for (const chatWindow of allHiddenWithThread) {
                if (chatWindow.thread.message_unread_counter > 0) {
                    amount++;
                }
            }
            return amount;
        }

        /**
         * @private
         * @returns {Object}
         */
        _computeVisual() {
            let visual = JSON.parse(JSON.stringify(BASE_VISUAL));
            if (!this.env.messaging || !this.env.messaging.isInitialized) {
                return visual;
            }
            const device = this.env.messaging.device;
            const discuss = this.env.messaging.discuss;
            const BETWEEN_GAP_WIDTH = 5;
            const CHAT_WINDOW_WIDTH = 325;
            const END_GAP_WIDTH = device.isMobile ? 0 : 10;
            const GLOBAL_WINDOW_WIDTH = device.globalWindowInnerWidth;
            const HIDDEN_MENU_WIDTH = 200; // max width, including width of dropup list items
            const START_GAP_WIDTH = device.isMobile ? 0 : 10;
            const chatWindows = this.allOrdered;
            if (!device.isMobile && discuss.isOpen) {
                return visual;
            }
            if (!chatWindows.length) {
                return visual;
            }
            const relativeGlobalWindowWidth = GLOBAL_WINDOW_WIDTH - START_GAP_WIDTH - END_GAP_WIDTH;
            let maxAmountWithoutHidden = Math.floor(
                relativeGlobalWindowWidth / (CHAT_WINDOW_WIDTH + BETWEEN_GAP_WIDTH));
            let maxAmountWithHidden = Math.floor(
                (relativeGlobalWindowWidth - HIDDEN_MENU_WIDTH - BETWEEN_GAP_WIDTH) /
                (CHAT_WINDOW_WIDTH + BETWEEN_GAP_WIDTH));
            if (device.isMobile) {
                maxAmountWithoutHidden = 1;
                maxAmountWithHidden = 1;
            }
            if (chatWindows.length <= maxAmountWithoutHidden) {
                // all visible
                for (let i = 0; i < chatWindows.length; i++) {
                    const _chatWindow = chatWindows[i].localId;
                    const offset = START_GAP_WIDTH + i * (CHAT_WINDOW_WIDTH + BETWEEN_GAP_WIDTH);
                    visual.visible.push({ _chatWindow, offset });
                }
                visual.availableVisibleSlots = maxAmountWithoutHidden;
            } else if (maxAmountWithHidden > 0) {
                // some visible, some hidden
                for (let i = 0; i < maxAmountWithHidden; i++) {
                    const _chatWindow = chatWindows[i].localId;
                    const offset = START_GAP_WIDTH + i * (CHAT_WINDOW_WIDTH + BETWEEN_GAP_WIDTH);
                    visual.visible.push({ _chatWindow, offset });
                }
                if (chatWindows.length > maxAmountWithHidden) {
                    visual.hidden.isVisible = !device.isMobile;
                    visual.hidden.offset = visual.visible[maxAmountWithHidden - 1].offset
                        + CHAT_WINDOW_WIDTH + BETWEEN_GAP_WIDTH;
                }
                for (let j = maxAmountWithHidden; j < chatWindows.length; j++) {
                    visual.hidden._chatWindows.push(chatWindows[j].localId);
                }
                visual.availableVisibleSlots = maxAmountWithHidden;
            } else {
                // all hidden
                visual.hidden.isVisible = !device.isMobile;
                visual.hidden.offset = START_GAP_WIDTH;
                visual.hidden._chatWindows.concat(chatWindows.map(chatWindow => chatWindow.localId));
                console.warn('cannot display any visible chat windows (screen is too small)');
                visual.availableVisibleSlots = 0;
            }
            return visual;
        }

    }

    ChatWindowManager.entityName = 'ChatWindowManager';

    ChatWindowManager.fields = {
        /**
         * List of ordered chat windows (list of local ids)
         */
        _ordered: attr({ default: [] }),
        // FIXME: dependent on implementation that uses arbitrary order in relations!!
        allOrdered: one2many('ChatWindow', {
            compute: '_computeAllOrdered',
            dependencies: [
                '_ordered',
                'chatWindows',
            ],
        }),
        allOrderedHidden: one2many('ChatWindow', {
            compute: '_computeAllOrderedHidden',
            dependencies: ['visual'],
        }),
        allOrderedHiddenThread: one2many('Thread', {
            related: 'allOrderedHidden.thread',
        }),
        allOrderedHiddenThreadMessageUnreadCounter: attr({
            related: 'allOrderedHiddenThread.message_unread_counter',
        }),
        allOrderedVisible: one2many('ChatWindow', {
            compute: '_computeAllOrderedVisible',
            dependencies: ['visual'],
        }),
        chatWindows: one2many('ChatWindow', {
            inverse: 'manager',
            isCausal: true,
        }),
        device: one2one('Device', {
            related: 'messaging.device',
        }),
        deviceGlobalWindowInnerWidth: attr({
            related: 'device.globalWindowInnerWidth',
        }),
        deviceIsMobile: attr({
            related: 'device.isMobile',
        }),
        discuss: one2one('Discuss', {
            related: 'messaging.discuss',
        }),
        discussIsOpen: attr({
            related: 'discuss.isOpen',
        }),
        hasHiddenChatWindows: attr({
            compute: '_computeHasHiddenChatWindows',
            dependencies: ['visual'],
        }),
        hasVisibleChatWindows: attr({
            compute: '_computeHasVisibleChatWindows',
            dependencies: ['visual'],
        }),
        isHiddenMenuOpen: attr({
            default: false,
        }),
        lastVisible: many2one('ChatWindow', {
            compute: '_computeLastVisible',
            dependencies: ['allOrderedVisible'],
        }),
        messaging: one2one('Messaging', {
            inverse: 'chatWindowManager',
        }),
        newMessageChatWindow: one2one('ChatWindow', {
            compute: '_computeNewMessageChatWindow',
            dependencies: ['allOrdered'],
        }),
        unreadHiddenConversationAmount: attr({
            compute: '_computeUnreadHiddenConversationAmount',
            dependencies: ['allOrderedHiddenThreadMessageUnreadCounter'],
        }),
        visual: attr({
            compute: '_computeVisual',
            default: BASE_VISUAL,
            dependencies: [
                'allOrdered',
                'deviceGlobalWindowInnerWidth',
                'deviceIsMobile',
                'discussIsOpen',
            ],
        }),
    };

    return ChatWindowManager;
}

registerNewEntity('ChatWindowManager', ChatWindowManagerFactory);

});
