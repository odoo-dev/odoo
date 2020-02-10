odoo.define('hr_holidays.component.Thread', function (require) {
'use strict';

const Thread = require('mail.component.Thread');

const { _t } = require('web.core');
const { patch } = require('web.utils');

patch(Thread, 'hr_holidays_thread', {

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
        return _.str.sprintf(_t("Out of office until %s."), formattedDate);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _useStore(state, props) {
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
