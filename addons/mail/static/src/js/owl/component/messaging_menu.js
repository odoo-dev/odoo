odoo.define('mail.component.MessagingMenu', function (require) {
"use strict";

const AutocompleteInput = require('mail.component.AutocompleteInput');
const MobileNavbar = require('mail.component.MobileMessagingNavbar');
const ThreadPreviewList = require('mail.component.ThreadPreviewList');

class MessagingMenu extends owl.store.ConnectedComponent {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.DEBUG = true;
        this.id = _.uniqueId('o_messagingMenu_');
        this.template = 'mail.component.MessagingMenu';
        this.components = {
            AutocompleteInput,
            MobileNavbar,
            ThreadPreviewList,
        };

        // bind since passed as props
        this._onMobileNewMessageInputSelect = this._onMobileNewMessageInputSelect.bind(this);
        this._onMobileNewMessageInputSource = this._onMobileNewMessageInputSource.bind(this);

        if (this.DEBUG) {
            window.messaging_menu = this;
        }
        this._globalCaptureEventListener = ev => this._onClickCaptureGlobal(ev);
    }

    mounted() {
        document.addEventListener('click', this._globalCaptureEventListener, true);
    }

    willUnmount() {
        document.removeEventListener('click', this._globalCaptureEventListener, true);
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @return {string}
     */
    get mobileNewMessageInputPlaceholder() {
        return this.env._t("Search user...");
    }

    /**
     * @return {Object[]}
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
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickCaptureGlobal(ev) {
        if (ev.target === this.el) {
            return;
        }
        if (ev.target.closest(`[data-id="${this.id}"]`)) {
            return;
        }
        if (ev.target.closest(`.${this.id}_mobileNewMessageInputAutocomplete`)) {
            return;
        }
        this.env.store.commit('closeMessagingMenu');
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickDesktopTabButton(ev) {
        this.env.store.commit('setMessagingMenuActiveTab', ev.currentTarget.dataset.tabId);
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickNewMessage(ev) {
        if (!this.props.isMobile) {
            this.env.store.commit('openThread', 'new_message');
            this.env.store.commit('closeMessagingMenu');
        } else {
            this.env.store.commit('toggleMessagingMenuMobileNewMessage');
        }
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickToggler(ev) {
        ev.preventDefault(); // no redirect href
        this.env.store.commit('toggleMessagingMenuOpen');
    }

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onHideMobileNewMessage(ev) {
        ev.stopPropagation();
        this.env.store.commit('toggleMessagingMenuMobileNewMessage');
    }

    /**
     * @private
     * @param {Event} ev
     * @param {Object} ui
     * @param {Object} ui.item
     * @param {integer} ui.item.id
     */
    _onMobileNewMessageInputSelect(ev, ui) {
        const partnerId = ui.item.id;
        const chat = this.env.store.getters.chatFromPartner(`res.partner_${partnerId}`);
        if (chat) {
            this.env.store.commit('openThread', chat.localId);
        } else {
            this.env.store.dispatch('createChannel', {
                autoselect: true,
                partnerId,
                type: 'chat'
            });
        }
        this.env.store.commit('closeMessagingMenu');
    }

    /**
     * @private
     * @param {Object} req
     * @param {string} req.term
     * @param {function} res
     */
    _onMobileNewMessageInputSource(req, res) {
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
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.tabId
     */
    _onSelectMobileNavbarTab(ev) {
        this.env.store.commit('setMessagingMenuActiveTab', ev.detail.tabId);
    }

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.threadLocalId
     */
    _onSelectThread(ev) {
        this.env.store.commit('openThread', ev.detail.threadLocalId);
        this.env.store.commit('closeMessagingMenu');
    }
}

MessagingMenu.defaultProps = {
    targetThreadCounter: 0,
};

/**
 * @param {Object} state
 * @param {Object} ownProps
 * @param {Object} getters
 * @return {Object}
 */
MessagingMenu.mapStoreToProps = function (state, ownProps, getters) {
    return {
        ...state.messagingMenu,
        counter: getters.globalThreadUnreadCounter(),
        isDiscussOpen: state.discuss.isOpen,
        isMobile: state.isMobile,
    };
};

MessagingMenu.props = {
    activeTabId: String,
    counter: Number,
    isDiscussOpen: Boolean,
    isMobile: Boolean,
    isMobileNewMessageToggled: Boolean,
    isOpen: Boolean,
};

return MessagingMenu;

});
