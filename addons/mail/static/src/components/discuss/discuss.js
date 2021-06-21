/** @odoo-module **/

import useShouldUpdateBasedOnProps from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';
import useStore from '@mail/component_hooks/use_store/use_store';
import AutocompleteInput from '@mail/components/autocomplete_input/autocomplete_input';
import Composer from '@mail/components/composer/composer';
import DiscussMobileMailboxSelection from '@mail/components/discuss_mobile_mailbox_selection/discuss_mobile_mailbox_selection';
import DiscussSidebar from '@mail/components/discuss_sidebar/discuss_sidebar';
import MobileMessagingNavbar from '@mail/components/mobile_messaging_navbar/mobile_messaging_navbar';
import NotificationList from '@mail/components/notification_list/notification_list';
import RtcCallParticipants from '@mail/components/rtc_call_participants/rtc_call_participants';
import ThreadView from '@mail/components/thread_view/thread_view';
import { link, unlink } from '@mail/model/model_field_command';

const { Component } = owl;
const { useRef } = owl.hooks;

const components = {
    AutocompleteInput,
    Composer,
    DiscussMobileMailboxSelection,
    DiscussSidebar,
    MobileMessagingNavbar,
    NotificationList,
    RtcCallParticipants,
    ThreadView,
};

class Discuss extends Component {
    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useShouldUpdateBasedOnProps();
        useStore((...args) => this._useStoreSelector(...args));
        this._updateLocalStoreProps();
        /**
         * Reference of the composer. Useful to focus it.
         */
        this._composerRef = useRef('composer');
        /**
         * Reference of the ThreadView. Useful to focus it.
         */
        this._threadViewRef = useRef('threadView');
        // bind since passed as props
        this._onMobileAddItemHeaderInputSelect = this._onMobileAddItemHeaderInputSelect.bind(this);
        this._onMobileAddItemHeaderInputSource = this._onMobileAddItemHeaderInputSource.bind(this);
    }

    mounted() {
        this.discuss.update({ isOpen: true });
        if (this.discuss.thread) {
            this.trigger('o-push-state-action-manager');
        } else if (this.env.isMessagingInitialized()) {
            this.discuss.openInitThread();
        }
        this._updateLocalStoreProps();
    }

    patched() {
        this.trigger('o-update-control-panel');
        if (this.discuss.thread) {
            this.trigger('o-push-state-action-manager');
        }
        if (
            this.discuss.thread &&
            this.discuss.thread === this.env.messaging.inbox &&
            this.discuss.threadView &&
            this._lastThreadCache === this.discuss.threadView.threadCache.localId &&
            this._lastThreadCounter > 0 && this.discuss.thread.counter === 0
        ) {
            this.trigger('o-show-rainbow-man');
        }
        this._activeThreadCache = this.discuss.threadView && this.discuss.threadView.threadCache;
        this._updateLocalStoreProps();
    }

    willUnmount() {
        if (this.discuss) {
            this.discuss.close();
        }
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {string}
     */
    get addChannelInputPlaceholder() {
        return this.env._t("Create or search channel...");
    }

    /**
     * @returns {string}
     */
    get addChatInputPlaceholder() {
        return this.env._t("Search user...");
    }

    /**
     * @returns {mail.discuss}
     */
    get discuss() {
        return this.env.messaging && this.env.messaging.discuss;
    }

    /**
     * @returns {Object[]}
     */
    mobileNavbarTabs() {
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
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _updateLocalStoreProps() {
        /**
         * Locally tracked store props `activeThreadCache`.
         * Useful to set scroll position from last stored one and to display
         * rainbox man on inbox.
         */
        this._lastThreadCache = (
            this.discuss.threadView &&
            this.discuss.threadView.threadCache &&
            this.discuss.threadView.threadCache.localId
        );
        /**
         * Locally tracked store props `threadCounter`.
         * Useful to display the rainbow man on inbox.
         */
        this._lastThreadCounter = (
            this.discuss.thread &&
            this.discuss.thread.counter
        );
    }

    /**
     * Returns data selected from the store.
     *
     * @private
     * @param {Object} props
     * @returns {Object}
     */
    _useStoreSelector(props) {
        const discuss = this.env.messaging && this.env.messaging.discuss;
        const thread = discuss && discuss.thread;
        const threadView = discuss && discuss.threadView;
        const replyingToMessage = discuss && discuss.replyingToMessage;
        const replyingToMessageOriginThread = replyingToMessage && replyingToMessage.originThread;
        return {
            discuss,
            discussActiveId: discuss && discuss.activeId, // for widget
            discussActiveMobileNavbarTabId: discuss && discuss.activeMobileNavbarTabId,
            discussIsAddingChannel: discuss && discuss.isAddingChannel,
            discussIsAddingChat: discuss && discuss.isAddingChat,
            discussIsDoFocus: discuss && discuss.isDoFocus,
            discussReplyingToMessageOriginThreadComposer: replyingToMessageOriginThread && replyingToMessageOriginThread.composer,
            inbox: this.env.messaging.inbox,
            isDeviceMobile: this.env.messaging && this.env.messaging.device.isMobile,
            isMessagingInitialized: this.env.isMessagingInitialized(),
            replyingToMessage,
            starred: this.env.messaging.starred,
            thread,
            threadCache: threadView && threadView.threadCache,
            threadChannelType: thread && thread.channel_type,
            threadCounter: thread && thread.counter,
            threadModel: thread && thread.model,
            threadView,
            threadViewMessagesLength: threadView && threadView.messages.length,
        };
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onFocusinComposer(ev) {
        this.discuss.update({ isDoFocus: false });
    }

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onHideMobileAddItemHeader(ev) {
        ev.stopPropagation();
        this.discuss.clearIsAddingItem();
    }

    /**
     * @private
     * @param {Event} ev
     * @param {Object} ui
     * @param {Object} ui.item
     * @param {integer} ui.item.id
     */
    _onMobileAddItemHeaderInputSelect(ev, ui) {
        const discuss = this.discuss;
        if (discuss.isAddingChannel) {
            discuss.handleAddChannelAutocompleteSelect(ev, ui);
        } else {
            discuss.handleAddChatAutocompleteSelect(ev, ui);
        }
    }

    /**
     * @private
     * @param {Object} req
     * @param {string} req.term
     * @param {function} res
     */
    _onMobileAddItemHeaderInputSource(req, res) {
        if (this.discuss.isAddingChannel) {
            this.discuss.handleAddChannelAutocompleteSource(req, res);
        } else {
            this.discuss.handleAddChatAutocompleteSource(req, res);
        }
    }

    /**
     * @private
     */
    _onReplyingToMessageMessagePosted() {
        this.env.services['notification'].notify({
            message: _.str.sprintf(
                this.env._t(`Message posted on "%s"`),
                this.discuss.replyingToMessage.originThread.displayName
            ),
            type: 'info',
        });
        this.discuss.clearReplyingToMessage();
    }

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.tabId
     */
    _onSelectMobileNavbarTab(ev) {
        ev.stopPropagation();
        if (this.discuss.activeMobileNavbarTabId === ev.detail.tabId) {
            return;
        }
        this.discuss.clearReplyingToMessage();
        this.discuss.update({ activeMobileNavbarTabId: ev.detail.tabId });
        const isChatSelected = this.discuss.activeMobileNavbarTabId === 'chat';
        const isChannelSelected = this.discuss.activeMobileNavbarTabId === 'channel';
        const isMailboxSelected = this.discuss.activeMobileNavbarTabId === 'mailbox';
        const isThreadMailbox = this.discuss.thread && this.discuss.thread.model === 'mailbox';
        if (isMailboxSelected && !isThreadMailbox) {
            this.discuss.update({ thread: link(this.env.messaging.inbox) });
        }
        if (!isMailboxSelected) {
            this.discuss.update({ thread: unlink() });
        }
        if (!isChatSelected) {
            this.discuss.update({ isAddingChat: false });
        }
        if (!isChannelSelected) {
            this.discuss.update({ isAddingChannel: false });
        }
    }

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onThreadRendered(ev) {
        this.trigger('o-update-control-panel');
    }

}

Object.assign(Discuss, {
    components,
    props: {},
    template: 'mail.Discuss',
});

export default Discuss;
