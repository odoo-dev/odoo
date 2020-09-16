/** @odoo-module alias=mail.components.MessagingMenu **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb } = owl;

export default class MessagingMenu extends usingModels(Component) {

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

        // bind since passed as props
        this._onMobileNewMessageInputSelect = this._onMobileNewMessageInputSelect.bind(this);
        this._onMobileNewMessageInputSource = this._onMobileNewMessageInputSource.bind(this);
        this._onClickCaptureGlobal = this._onClickCaptureGlobal.bind(this);
        this._constructor(...args);
    }

    /**
     * Allows patching constructor.
     */
    _constructor() {}

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
     * @returns {Discuss}
     */
    get discuss() {
        return (
            this.env.services.model.messaging &&
            this.env.services.model.messaging.$$$discuss(this)
        );
    }

    /**
     * @returns {MessagingMenu}
     */
    get messagingMenu() {
        return (
            this.env.services.model.messaging &&
            this.env.services.model.messaging.$$$messagingMenu(this)
        );
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
        return [
            {
                icon: 'fa fa-envelope',
                id: 'all',
                label: this.env._t("All"),
            },
            {
                icon: 'fa fa-user',
                id: 'chat',
                label: this.env._t("Chat"),
            },
            {
                icon: 'fa fa-users',
                id: 'channel',
                label: this.env._t("Channel"),
            },
        ];
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Closes the menu when clicking outside, if appropriate.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickCaptureGlobal(ev) {
        if (!this.env.services.model.messaging) {
            /**
             * Messaging not created, which means essential models like
             * messaging menu are not ready, so user interactions are omitted
             * during this (short) period of time.
             */
            return;
        }
        // ignore click inside the menu
        if (this.el.contains(ev.target)) {
            return;
        }
        // in all other cases: close the messaging menu when clicking outside
        this.env.services.action.dispatch('MessagingMenu/close',
            this.messagingMenu,
        );
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickDesktopTabButton(ev) {
        this.env.services.action.dispatch('Record/update', this.messagingMenu, {
            $$$activeTabId: ev.currentTarget.dataset.tabId,
        });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickNewMessage(ev) {
        if (!this.env.services.model.messaging.$$$device(this).$$$isMobile(this)) {
            this.env.services.action.dispatch('ChatWindowManager/openNewMessage',
                this.env.services.model.messaging.$$$chatWindowManager(this),
            );
            this.env.services.action.dispatch('MessagingMenu/close',
                this.messagingMenu,
            );
        } else {
            this.env.services.action.dispatch('MessagingMenu/toggleMobileNewMessage',
                this.messagingMenu,
            );
        }
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickToggler(ev) {
        // avoid following dummy href
        ev.preventDefault();
        if (!this.env.services.model.messaging) {
            /**
             * Messaging not created, which means essential models like
             * messaging menu are not ready, so user interactions are omitted
             * during this (short) period of time.
             */
            return;
        }
        this.env.services.action.dispatch('MessagingMenu/toggleOpen',
            this.messagingMenu,
        );
    }

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onHideMobileNewMessage(ev) {
        ev.stopPropagation();
        this.env.services.action.dispatch('MessagingMenu/toggleMobileNewMessage',
            this.messagingMenu,
        );
    }

    /**
     * @private
     * @param {Event} ev
     * @param {Object} ui
     * @param {Object} ui.item
     * @param {integer} ui.item.id
     */
    _onMobileNewMessageInputSelect(ev, ui) {
        this.env.services.action.dispatch('Messaging/openChat',
            this.env.services.model.messaging,
            { partnerId: ui.item.id },
        );
    }

    /**
     * @private
     * @param {Object} req
     * @param {string} req.term
     * @param {function} res
     */
    _onMobileNewMessageInputSource(req, res) {
        const value = _.escape(req.term);
        this.env.services.action.dispatch('Partner/imSearch', {
            callback: partners => {
                const suggestions = partners.map(
                    partner => {
                        return {
                            id: partner.$$$id(this),
                            value: partner.$$$nameOrDisplayName(this),
                            label: partner.$$$nameOrDisplayName(this),
                        };
                    },
                );
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
        this.env.services.action.dispatch('Record/update', this.messagingMenu, {
            $$$activeTabId: ev.detail.tabId,
        });
    }

}

Object.assign(MessagingMenu, {
    props: {},
    template: 'mail.MessagingMenu',
});

QWeb.registerComponent('MessagingMenu', MessagingMenu);
