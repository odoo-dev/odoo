odoo.define('mail.component.MobileMessagingNavbar', function () {
'use strict';

class MobileMessagingNavbar extends owl.Component {
    /**
     * @param  {...any} args
     */
    constructor(...args) {
        super(...args);
        this.template = 'mail.component.MobileMessagingNavbar';
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClick(ev) {
        this.trigger('o-select-mobile-messaging-navbar-tab', {
            tabId: ev.currentTarget.dataset.tabId,
        });
    }
}

MobileMessagingNavbar.defaultProps = {
    tabs: [],
};

MobileMessagingNavbar.props = {
    activeTabId: String,
    tabs: {
        type: Array,
        element: {
            type: Object,
            shape: {
                icon: {
                    type: String,
                    optional: true,
                },
                id: String,
                label: String,
            },
        },
    },
};

return MobileMessagingNavbar;

});
