odoo.define('mail.messaging.component.MessagingMenu', function (require) {
'use strict';

const components = {
    AutocompleteInput: require('mail.messaging.component.AutocompleteInput'),
    MobileMessagingNavbar: require('mail.messaging.component.MobileMessagingNavbar'),
    NotificationList: require('mail.messaging.component.NotificationList'),
};
const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;
const { useDispatch, useGetters, useRef } = owl.hooks;

class MessagingMenu extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        /**
         * global JS generated ID for this component. Useful to provide a
         * custom class to autocomplete input, so that click in an autocomplete
         * item is not considered as a click away from messaging menu in mobile.
         */
        this.id = _.uniqueId('o_messagingMenu_');
        this.storeDispatch = useDispatch();
        this.storeGetters = useGetters();
        this.storeProps = useStore((...args) => this._useStoreSelector(...args));

        /**
         * Reference of the new message input in mobile. Useful to include it
         * and autocomplete menu as "inside" the messaging menu, to prevent
         * closing the messaging menu otherwise.
         */
        this._mobileNewMessageInputRef = useRef('mobileNewMessageInput');

        // bind since passed as props
        this._onMobileNewMessageInputSelect = this._onMobileNewMessageInputSelect.bind(this);
        this._onMobileNewMessageInputSource = this._onMobileNewMessageInputSource.bind(this);

        this._onClickCaptureGlobal = this._onClickCaptureGlobal.bind(this);
    }

    mounted() {
        document.addEventListener('click', this._onClickCaptureGlobal, true);
    }

    willUnmount() {
        document.removeEventListener('click', this._onClickCaptureGlobal, true);
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.messaging.entity.MessagingMenu}
     */
    get messagingMenu() {
        return this.storeProps.messagingMenu;
    }

    /**
     * @returns {string}
     */
    get mobileNewMessageInputPlaceholder() {
        return this.env._t("Search user...");
    }

    /**
     * @returns {Object[]}
     */
    get tabs() {
        return [{
            icon: 'fa fa-envelope',
            id: 'all',
            label: this.env._t("All"),
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
    _useStoreSelector(state, props) {
        const unreadMailChannelCounter = this.storeGetters.allOrderedAndPinnedChannels()
            .reduce((acc, mailChannel) => {
                if (mailChannel.message_unread_counter > 0) {
                    acc++;
                }
                return acc;
            }, 0);
        const mailboxInboxCounter = state.threads['mail.box_inbox'].counter;
        const counter = unreadMailChannelCounter + mailboxInboxCounter;

        return {
            counter,
            isDiscussOpen: state.discuss.isOpen,
            isMessagingInitialized: state.isMessagingInitialized,
            isMobile: state.isMobile,
            messagingMenu: state.messagingMenu,
        };
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickCaptureGlobal(ev) {
        // in mobile: keeps the messaging menu open in background
        // TODO SEB maybe need to move this to a mobile component?
        if (
            this.storeProps.isMobile &&
            this.storeGetters.haveVisibleChatWindows()
        ) {
            return;
        }
        // closes the menu when clicking outside
        if (this.el.contains(ev.target)) {
            return;
        }
        const input = this._mobileNewMessageInputRef.comp;
        if (input && input.contains(ev.target)) {
            return;
        }
        this.storeDispatch('closeMessagingMenu');
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickDesktopTabButton(ev) {
        ev.stopPropagation();
        this.storeDispatch('updateMessagingMenu', {
            activeTabId: ev.currentTarget.dataset.tabId,
        });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickNewMessage(ev) {
        ev.stopPropagation();
        if (!this.storeProps.isMobile) {
            this.storeDispatch('openThread', 'new_message');
            this.storeDispatch('closeMessagingMenu');
        } else {
            this.storeDispatch('toggleMessagingMenuMobileNewMessage');
        }
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickToggler(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        this.storeDispatch('toggleMessagingMenuOpen');
    }

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onHideMobileNewMessage(ev) {
        ev.stopPropagation();
        this.storeDispatch('toggleMessagingMenuMobileNewMessage');
    }

    /**
     * @private
     * @param {Event} ev
     * @param {Object} ui
     * @param {Object} ui.item
     * @param {integer} ui.item.id
     */
    _onMobileNewMessageInputSelect(ev, ui) {
        // TODO SEB this should probably be done in autocomplete component
        const partnerId = ui.item.id;
        const chat = this.storeGetters.chatFromPartner(`res.partner_${partnerId}`);
        if (chat) {
            this.storeDispatch('openThread', chat.localId);
        } else {
            this.storeDispatch('createChannel', {
                autoselect: true,
                partnerId,
                type: 'chat'
            });
        }
        if (!this.storeProps.isMobile) {
            this.storeDispatch('closeMessagingMenu');
        }
    }

    /**
     * @private
     * @param {Object} req
     * @param {string} req.term
     * @param {function} res
     */
    _onMobileNewMessageInputSource(req, res) {
        // TODO SEB this should probably be done in autocomplete component
        const value = _.escape(req.term);
        this.storeDispatch('searchPartners', {
            callback: partners => {
                const suggestions = partners.map(partner => {
                    return {
                        id: partner.id,
                        value: this.storeGetters.partnerName(partner.localId),
                        label: this.storeGetters.partnerName(partner.localId),
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
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.tabId
     */
    _onSelectMobileNavbarTab(ev) {
        ev.stopPropagation();
        this.storeDispatch('updateMessagingMenu', {
            activeTabId: ev.detail.tabId,
        });
    }

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.threadLocalId
     */
    _onSelectThread(ev) {
        ev.stopPropagation();
        this.storeDispatch('openThread', ev.detail.threadLocalId);
        if (!this.storeProps.isMobile) {
            this.storeDispatch('closeMessagingMenu');
        }
    }

}

Object.assign(MessagingMenu, {
    components,
    props: {},
    template: 'mail.messaging.component.MessagingMenu',
});

return MessagingMenu;

});
