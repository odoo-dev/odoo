odoo.define('mail.component.Discuss', function (require) {
'use strict';

const AutocompleteInput = require('mail.component.AutocompleteInput');
// const ChatWindow = require('mail.component.ChatWindow');
const Composer = require('mail.component.Composer');
const MobileMailboxSelection = require('mail.component.DiscussMobileMailboxSelection');
const Sidebar = require('mail.component.DiscussSidebar');
const MobileNavbar = require('mail.component.MobileMessagingNavbar');
const Thread = require('mail.component.Thread');
const ThreadPreviewList = require('mail.component.ThreadPreviewList');

class Discuss extends owl.store.ConnectedComponent {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.DEBUG = true;
        this.components = {
            AutocompleteInput,
            // ChatWindow,
            Composer,
            MobileMailboxSelection,
            MobileNavbar,
            Sidebar,
            Thread,
            ThreadPreviewList,
        };
        this.id = _.uniqueId('o_discuss_');
        this.state = {
            isAddingChannel: false,
            isAddingChat: false,
            isReplyingToMessage: false,
            replyingToMessageCounter: 0,
            replyingToMessageMessageLocalId: null,
            replyingToMessageThreadLocalId: null,
            threadCachesStoredScrollTop: {},
        };
        this.template = 'mail.component.Discuss';
        this._addingChannelValue = "";
        this._globalCaptureClickEventListener = ev => this._onClickCaptureGlobal(ev);
        /**
         * Tracked last targeted thread. Used to determine whether it should
         * autoscroll and style target thread, in either sidebar or in mobile.
         */
        this._targetThreadCounter = 0;
        this._targetThreadLocalId = null;
        /**
         * Info tracked during will patch, used to determine whether the replying
         * composer should be autofocus or not. This is useful in order to auto
         * scroll to composer when it is automatically focused in mobile.
         */
        this._willPatchTrackedInfo = {
            isReplyingToMessage: false,
            replyingToMessageCounter: 0,
        };

        // bind since passed as props
        this._onAddChannelAutocompleteSelect = this._onAddChannelAutocompleteSelect.bind(this);
        this._onAddChannelAutocompleteSource = this._onAddChannelAutocompleteSource.bind(this);
        this._onAddChatAutocompleteSelect = this._onAddChatAutocompleteSelect.bind(this);
        this._onAddChatAutocompleteSource = this._onAddChatAutocompleteSource.bind(this);
        this._onMobileAddItemHeaderInputSelect = this._onMobileAddItemHeaderInputSelect.bind(this);
        this._onMobileAddItemHeaderInputSource = this._onMobileAddItemHeaderInputSource.bind(this);

        if (this.DEBUG) {
            window.discuss = this;
        }
    }

    mounted() {
        document.addEventListener('click', this._globalCaptureClickEventListener, true);
        this.env.store.commit('setDiscussOpen');
        if (this.props.activeThreadLocalId) {
            this.trigger('o-push-state-action-manager', {
                activeThreadLocalId: this.props.initActiveThreadLocalId,
            });
        } else {
            this.env.store.commit('openThread', this.props.initActiveThreadLocalId, {
                resetDiscussDomain: true,
            });
        }
    }

    /**
     * @param {Object} nextProps
     * @param {Object} [nextProps.activeThread]
     * @param {integer} [nextProps.activeThreadCounter]
     */
    willUpdateProps(nextProps) {
        const activeThread = this.props.activeThread;
        if (!activeThread) {
            return;
        }
        const nextActiveThread = nextProps.activeThread;
        if (!nextActiveThread) {
            return;
        }
        if (activeThread.localId !== nextActiveThread.localId) {
            return;
        }
        if (activeThread.localId !== 'mail.box_inbox') {
            return;
        }
        if (
            nextProps.activeThreadCounter === 0 &&
            this.props.activeThreadCounter > 0
        ) {
            this.trigger('o-show-rainbow-man');
        }
        if (nextProps.activeThreadLocalId !== this.props.activeThreadLocalId) {
            this.trigger('o-push-state-action-manager', {
                activeThreadLocalId: nextProps.activeThreadLocalId,
            });
        }
    }

    /**
     * @return {Object}
     */
    willPatch() {
        const shouldFocusReplyComposer =
            this.state.isReplyingToMessage &&
            (
                !this._willPatchTrackedInfo.isReplyingToMessage ||
                (
                    this._willPatchTrackedInfo.replyingToMessageCounter !==
                    this.state.replyingToMessageCounter
                )
            );
        Object.assign(this._willPatchTrackedInfo, {
            isReplyingToMessage: this.state.isReplyingToMessage,
            replyingToMessageCounter: this.state.replyingToMessageCounter,
        });
        return {
            shouldFocusReplyComposer,
        };
    }

    /**
     * @param {Object} snapshot
     * @param {boolean} snapshot.shouldFocusReplyComposer
     */
    patched(snapshot) {
        if (snapshot.shouldFocusReplyComposer) {
            // FIXME: does not work the 1st time on iOS for some reasons
            this.refs.replyingToMessageComposer.focus();
        }
        this.trigger('o-update-control-panel');
        this.trigger('o-push-state-action-manager', {
            activeThreadLocalId: this.props.activeThreadLocalId,
        });
        if (
            this.props.targetThreadLocalId &&
            (
                this._targetThreadLocalId !== this.props.targetThreadLocalId ||
                this._targetThreadCounter !== this.props.targetThreadCounter
            )
        ) {
            if (!this.props.isMobile) {
                const isItemPartiallyVisible =
                    this
                        .refs
                        .sidebar
                        .isItemPartiallyVisible(this.props.targetThreadLocalId);
                if (!isItemPartiallyVisible) {
                    this.refs.sidebar.scrollToItem(this.props.targetThreadLocalId);
                }
            } else if (!this.props.activeThreadLocalId) {
                const targetThread =
                    this
                        .env
                        .store
                        .state
                        .threads[this.props.targetThreadLocalId];
                if (targetThread._model !== 'mail.box') {
                    const isPreviewPartiallyVisible =
                        this
                            .refs
                            .threadPreviewList
                            .isPreviewPartiallyVisible(this.props.targetThreadLocalId);
                    if (!isPreviewPartiallyVisible) {
                        this
                            .refs
                            .threadPreviewList
                            .scrollToPreview(this.props.targetThreadLocalId);
                    }
                }
            }
        }
        this._targetThreadCounter = this.props.targetThreadCounter;
        this._targetThreadLocalId = this.props.targetThreadLocalId;
    }

    willUnmount() {
        document.removeEventListener('click', this._globalCaptureClickEventListener, true);
        this.env.store.commit('closeDiscuss');
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @return {string}
     */
    get addChannelInputPlaceholder() {
        return this.env._t("Create or search channel...");
    }

    /**
     * @return {string}
     */
    get addChatInputPlaceholder() {
        return this.env._t("Search user...");
    }

    /**
     * @return {Object[]}
     */
    get mobileNavbarTabs() {
        return [{
            icon: 'fa fa-inbox',
            id: 'mailbox',
            label: this.env._t("Mailboxes"),
        }, {
            icon: 'fa fa-user',
            id: 'chat',
            label: this.env._t("Chat"),
        }, {
            icon: 'fa fa-users',
            id: 'channel',
            label: this.env._t("Channel"),
        }];
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    doMobileNewChannel() {
        this.state.isAddingChannel = true;
    }

    doMobileNewMessage() {
        this.state.isAddingChat = true;
    }

    /**
     * @return {boolean}
     */
    hasActiveThreadMessages() {
        if (!this.props.activeThreadCache) {
            return false;
        }
        return this.props.activeThreadCache.messageLocalIds.length > 0;
    }

    /**
     * @param {Array} domain
     */
    updateDomain(domain) {
        this.env.store.commit('setDiscussDomain', domain);
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _cancelReplyingToMessage() {
        this.state.isReplyingToMessage = false;
        this.state.replyingToMessageCounter = 0;
        this.state.replyingToMessageMessageLocalId = null;
        this.state.replyingToMessageThreadLocalId = null;
    }

    /**
     * @private
     */
    _clearAddingItem() {
        this.state.isAddingChannel = false;
        this.state.isAddingChat = false;
        this._addingChannelValue = '';
    }

    /**
     * @private
     * @param {string} threadLocalId
     */
    _openThread(threadLocalId) {
        if (
            !this.props.isMobile &&
            this.props.activeThreadCache &&
            this.props.activeThreadCache.isLoaded &&
            this.props.activeThreadCache.messageLocalIds.length > 0
        ) {
            const scrollTop = this.refs.thread.getScrollTop();
            if (typeof scrollTop === 'number') {
                owl.core.Observer.set(
                    this.state.threadCachesStoredScrollTop,
                    this.props.activeThreadCacheLocalId,
                    scrollTop);
            }
        }
        if (this.state.isReplyingToMessage) {
            this._cancelReplyingToMessage();
        }
        this.env.store.commit('openThread', threadLocalId);
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     * @param {Object} ui
     * @param {Object} ui.item
     * @param {integer} ui.item.id
     */
    _onAddChannelAutocompleteSelect(ev, ui) {
        if (ui.item.special) {
            this.env.store.dispatch('createChannel', {
                name: this._addingChannelValue,
                public: ui.item.special,
                type: 'channel'
            });
        } else {
            this.env.store.dispatch('joinChannel', ui.item.id, { autoselect: true });
        }
        this._clearAddingItem();
    }

    /**
     * @private
     * @param {Object} req
     * @param {string} req.term
     * @param {function} res
     */
    async _onAddChannelAutocompleteSource(req, res) {
        const value = _.escape(req.term);
        this._addingChannelValue = value;
        const result = await this.env.rpc({
            model: 'mail.channel',
            method: 'channel_search_to_join',
            args: [value],
        });
        const items = result.map(data => {
            let escapedName = _.escape(data.name);
            return Object.assign(data, {
                label: escapedName,
                value: escapedName
            });
        });
        items.push({
            label:
                this
                    .env
                    .qweb
                    .renderToString('mail.component.Discuss.AutocompleteChannelPublicItem', {
                        searchVal: value,
                    }),
            value,
            special: 'public'
        }, {
            label:
                this
                    .env
                    .qweb
                    .renderToString('mail.component.Discuss.AutocompleteChannelPrivateItem', {
                        searchVal: value,
                    }),
            value,
            special: 'private'
        });
        res(items);
    }

    /**
     * @private
     * @param {Event} ev
     * @param {Object} ui
     * @param {Object} ui.item
     * @param {integer} ui.item.id
     */
    _onAddChatAutocompleteSelect(ev, ui) {
        const partnerId = ui.item.id;
        const chat = this.env.store.getters.chatFromPartner(`res.partner_${partnerId}`);
        if (chat) {
            this._openThread(chat.localId);
        } else {
            this.env.store.dispatch('createChannel', {
                autoselect: true,
                partnerId,
                type: 'chat'
            });
        }
        this._clearAddingItem();
    }

    /**
     * @private
     * @param {Object} req
     * @param {string} req.term
     * @param {function} res
     */
    _onAddChatAutocompleteSource(req, res) {
        const value = _.escape(req.term);
        this.env.store.dispatch('searchPartners', {
            callback: partners => {
                const suggestions = partners.map(partner => {
                    return {
                        id: partner.id,
                        value: this.env.store.getters.partnerName(partner.localId),
                        label: this.env.store.getters.partnerName(partner.localId),
                    };
                });
                res(_.sortBy(suggestions, 'label'));
            },
            keyword: value,
            limit: 10,
        });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickCaptureGlobal(ev) {
        if (this.props.targetThreadLocalId) {
            this.env.store.commit('setDiscussTargetThread', null);
        }
    }

    /**
     * @private
     */
    _onHideMobileAddItemHeader() {
        this._clearAddingItem();
    }

    /**
     * @private
     * @param {Event} ev
     * @param {Object} ui
     * @param {Object} ui.item
     * @param {integer} ui.item.id
     */
    _onMobileAddItemHeaderInputSelect(ev, ui) {
        if (this.state.isAddingChannel) {
            this._onAddChannelAutocompleteSelect(ev, ui);
        } else {
            this._onAddChatAutocompleteSelect(ev, ui);
        }
    }

    /**
     * @private
     * @param {Object} req
     * @param {string} req.term
     * @param {function} res
     */
    _onMobileAddItemHeaderInputSource(req, res) {
        if (this.state.isAddingChannel) {
            this._onAddChannelAutocompleteSource(req, res);
        } else {
            this._onAddChatAutocompleteSource(req, res);
        }
    }

    /**
     * TODO: almost duplicate code with
     *
     *  - ChatWindowManager._onRedirect()
     *
     * @private
     * @param {Event} ev
     * @param {Object} ev.detail
     * @param {integer} ev.detail.id
     * @param {string} ev.detail.model
     */
    async _onRedirect(ev) {
        const { id, model } = ev.detail;
        if (model === 'mail.channel') {
            ev.stopPropagation();
            const threadLocalId = `${model}_${id}`;
            const channel = this.env.store.state.threads[threadLocalId];
            if (!channel) {
                this.env.store.dispatch('joinChannel', id, {
                    autoselect: true,
                });
                return;
            }
            this.env.store.commit('openThread', threadLocalId);
            return;
        } else if (model === 'res.partner') {
            if (id === this.env.session.partner_id) {
                this.env.do_action({
                    type: 'ir.actions.act_window',
                    res_model: 'res.partner',
                    views: [[false, 'form']],
                    res_id: id,
                });
                return;
            }
            const partnerLocalId = `res.partner_${id}`;
            const partner = this.env.store.state.partners[partnerLocalId];
            if (partner.userId === undefined) {
                // rpc to check that
                await this.env.store.dispatch('checkPartnerIsUser', partnerLocalId);
            }
            if (partner.userId === null) {
                // partner is not a user, open document instead
                this.env.do_action({
                    type: 'ir.actions.act_window',
                    res_model: 'res.partner',
                    views: [[false, 'form']],
                    res_id: partner.id,
                });
                return;
            }
            ev.stopPropagation();
            const chat = this.env.store.getters.chatFromPartner(`res.partner_${id}`);
            if (!chat) {
                this.env.store.dispatch('createChannel', {
                    autoselect: true,
                    partnerId: id,
                    type: 'chat',
                });
                return;
            }
            this.env.store.commit('openThread', chat.localId);
        } else {
            this.env.do_action({
                type: 'ir.actions.act_window',
                res_model: model,
                views: [[false, 'form']],
                res_id: id,
            });
        }
    }

    /**
     * @private
     */
    _onReplyingToMessageComposerDiscarded() {
        this._cancelReplyingToMessage();
    }

    /**
     * @private
     */
    _onReplyingToMessageMessagePosted() {
        this.env.do_notify(
            _.str.sprintf(
                this.env._t("Message posted on \"%s\""),
                this.env.store.getters.threadName(this.state.replyingToMessageThreadLocalId)));
        this._cancelReplyingToMessage();
    }

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.messageLocalId
     */
    _onReplyMessage(ev) {
        const { messageLocalId } = ev.detail;
        if (this.state.replyingToMessageMessageLocalId === messageLocalId) {
            this._cancelReplyingToMessage();
        } else {
            this.state.isReplyingToMessage = true;
            this.state.replyingToMessageCounter++;
            this.state.replyingToMessageMessageLocalId = messageLocalId;
            this.state.replyingToMessageThreadLocalId =
                this.env.store.state.messages[messageLocalId].originThreadLocalId;
        }
    }

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.tabId
     */
    _onSelectMobileNavbarTab(ev) {
        const { tabId } = ev.detail;
        if (this.props.activeMobileNavbarTabId === tabId) {
            return;
        }
        this._cancelReplyingToMessage();
        this.env.store.commit('setDiscussActiveMobileNavbarTab', tabId);
    }

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.threadLocalId
     */
    _onSelectThread(ev) {
        this._openThread(ev.detail.threadLocalId);
    }

    /**
     * @private
     */
    _onSidebarAddingChannel() {
        this.state.isAddingChannel = true;
    }

    /**
     * @private
     */
    _onSidebarAddingChat() {
        this.state.isAddingChat = true;
    }

    /**
     * @private
     */
    _onSidebarCancelAddingItem() {
        this._clearAddingItem();
    }

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onThreadRendered(ev) {
        this.trigger('o-update-control-panel');
    }
}

Discuss.defaultProps = {
    domain: [],
    targetThreadCounter: 0,
};

/**
 * @param {Object} state
 * @return {Object}
 */
Discuss.mapStoreToProps = function (state) {
    const {
        activeThreadLocalId,
        stringifiedDomain,
    } = state.discuss;
    const activeThread = state.threads[activeThreadLocalId];
    const activeThreadCacheLocalId = `${activeThreadLocalId}_${stringifiedDomain}`;
    const activeThreadCache = state.threadCaches[activeThreadCacheLocalId];
    return {
        ...state.discuss,
        activeThread,
        activeThreadCache,
        activeThreadCacheLocalId,
        // intentionally keep unsynchronize value of old thread counter
        // useful in willUpdateProps to detect change of counter
        activeThreadCounter: activeThread && activeThread.counter,
        isMobile: state.isMobile,
    };
};

Discuss.props = {
    activeMobileNavbarTabId: String,
    activeThread: {
        type: Object, // {mail.store.model.Thread}
        optional: true,
    },
    activeThreadCache: {
        type: Object, // {mail.store.model.ThreadCache}
        optional: true,
    },
    activeThreadCacheLocalId: String,
    activeThreadCounter: {
        type: Number,
        optional: true,
    },
    activeThreadLocalId: String,
    domain: Array,
    initActiveThreadLocalId: String,
    isMobile: Boolean,
    stringifiedDomain: {
        type: String,
        optional: true,
    },
    targetThreadCounter: Number,
    targetThreadLocalId: {
        type: String,
        optional: true,
    },
};

return Discuss;

});
