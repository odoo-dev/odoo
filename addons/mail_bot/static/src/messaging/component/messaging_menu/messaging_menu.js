odoo.define('mail_bot.messaging.component.MessagingMenu', function (require) {
'use strict';

const components = {
    MessagingMenu: require('mail.messaging.component.MessagingMenu'),
};

// ensure the store is patched before patching the component
require('mail_bot.MailBotService');

const { patch } = require('web.utils');

patch(components.MessagingMenu, 'mail_bot.messaging.component.MessagingMenu', {

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Override so that 'OdooBot has a request' is included in the computation
     * of the counter.
     *
     * @override
     */
    _useStoreSelector(state, props) {
        const res = this._super(...arguments);
        if (state.mailbotHasRequest) {
            res.counter += 1;
        }
        return res;
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onOdoobotRequestClicked() {
        if (!this.storeProps.isMobile) {
            this.storeDispatch('closeMessagingMenu');
        }
    },
});

});
