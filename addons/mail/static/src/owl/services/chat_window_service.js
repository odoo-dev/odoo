odoo.define('mail.service.ChatWindow', function (require) {
'use strict';

const ChatWindowManager = require('mail.component.ChatWindowManager');

const AbstractService = require('web.AbstractService');
const { bus, serviceRegistry } = require('web.core');

const ChatWindowService = AbstractService.extend({
    dependencies: ['messaging'],
    /**
     * @override {web.AbstractService}
     */
    start() {
        this._super(...arguments);
        this._webClientReady = false;
        this.env = this.call('messaging', 'getMessagingEnv');
        if (!this.env.isTest) {
            bus.on('hide_home_menu', this, this._onHideHomeMenu.bind(this));
            bus.on('show_home_menu', this, this._onShowHomeMenu.bind(this));
            bus.on('web_client_ready', this, this._onWebClientReady.bind(this));
            bus.on('will_hide_home_menu', this, this._onWillHideHomeMenu.bind(this));
            bus.on('will_show_home_menu', this, this._onWillShowHomeMenu.bind(this));
        } else {
            this['test:hide_home_menu'] = this._onHideHomeMenu;
            this['test:show_home_menu'] = this._onShowHomeMenu;
            this['test:web_client_ready'] = this._onWebClientReady;
            this['test:will_hide_home_menu'] = this._onWillHideHomeMenu;
            this['test:will_show_home_menu'] = this._onWillShowHomeMenu;
        }
    },
    /**
     * @private
     */
    destroy() {
        if (this.component) {
            this.component.destroy();
            this.component = undefined;
        }
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    async _mount() {
        if (this.component) {
            this.component.destroy();
            this.component = undefined;
        }
        ChatWindowManager.env = this.env;
        this.component = new ChatWindowManager(null);
        let parentNode;
        if (this.env.isTest) {
            parentNode = document.querySelector(this.env.testServiceTarget);
        } else {
            parentNode = document.querySelector('body');
        }
        await this.component.mount(parentNode);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    async _onHideHomeMenu() {
        if (!this._webClientReady) {
            return;
        }
        if (document.querySelector('.o_ChatWindowManager')) {
            return;
        }
        await this._mount();
    },
    /**
     * @private
     */
    async _onShowHomeMenu() {
        if (!this._webClientReady) {
            return;
        }
        if (document.querySelector('.o_ChatWindowManager')) {
            return;
        }
        await this._mount();
    },
    /**
     * @private
     */
    async _onWebClientReady() {
        await this._mount();
        this._webClientReady = true;
    },
    /**
     * @private
     */
    async _onWillHideHomeMenu() {
        if (this.component) {
            this.component.saveChatWindowsScrollTops();
        }
    },
    /**
     * @private
     */
    async _onWillShowHomeMenu() {
        if (this.component) {
            this.component.saveChatWindowsScrollTops();
        }
    },
});

serviceRegistry.add('chat_window', ChatWindowService);

return ChatWindowService;

});
