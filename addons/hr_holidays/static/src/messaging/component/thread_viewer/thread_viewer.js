odoo.define('hr_holidays.messaging.component.ThreadViewer', function (require) {
'use strict';

const components = {
    ThreadViewer: require('mail.messaging.component.ThreadViewer'),
};

const { patch } = require('web.utils');

patch(components.ThreadViewer, 'hr_holidays.messaging.component.ThreadViewer', {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Returns the "out of office" text for the direct partner of the thread if
     * applicable.
     *
     * @returns {string}
     */
    getOutOfOfficeText() {
        if (!this.storeProps.directPartner) {
            return "";
        }
        if (!this.storeProps.directPartner.out_of_office_date_end) {
            return "";
        }
        const currentDate = new Date();
        const date = new Date(this.storeProps.directPartner.out_of_office_date_end);
        const options = { day: 'numeric', month: 'short' };
        if (currentDate.getFullYear() !== date.getFullYear()) {
            options.year = 'numeric';
        }
        const formattedDate = date.toLocaleDateString(window.navigator.language, options);
        return _.str.sprintf(this.env._t("Out of office until %s."), formattedDate);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _useStoreSelector(state, props) {
        const res = this._super(...arguments);
        const directPartnerLocalId = res.thread
            ? res.thread.directPartnerLocalId
            : undefined;
        const directPartner = directPartnerLocalId
            ? state.partners[directPartnerLocalId]
            : undefined;
        return Object.assign({}, res, {
            directPartner,
        });
    },
});

});
