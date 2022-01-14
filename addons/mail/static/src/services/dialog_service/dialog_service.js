/** @odoo-module **/

import { getMessagingComponent } from "@mail/utils/messaging_component";

import AbstractService from 'web.AbstractService';
import { bus } from 'web.core';

const { App } = owl;

export const DialogService = AbstractService.extend({
    dependencies: ['messaging'],
    /**
     * @override {web.AbstractService}
     */
    start() {
        this._super(...arguments);
        this._listenHomeMenu();
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
     * @returns {Node}
     */
    _getParentNode() {
        return document.querySelector('body');
    },
    /**
     * @private
     */
    _listenHomeMenu() {
        bus.on('web_client_ready', this, this._onWebClientReady.bind(this));
    },
    /**
     * @private
     */
    async _mount() {
        if (this.component) {
            this.component.destroy();
            this.component = undefined;
        }
        const DialogManagerComponent = getMessagingComponent("DialogManager");
        const app = new App(DialogManagerComponent, {
            env: owl.Component.env,
            templates: window.__ODOO_TEMPLATES__,
        });
        const parentNode = this._getParentNode();
        this.component = await app.mount(parentNode);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    async _onWebClientReady() {
        await this._mount();
    }
});
