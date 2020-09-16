/** @odoo-module alias=sms.components.NotificationGroup **/

import NotificationGroup from 'mail.components.NotificationGroup';

import { patch } from 'web.utils';

patch(
    NotificationGroup.prototype,
    'sms.components.NotificationGroup',
    {

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        /**
         * @override
         */
        image() {
            if (this.group.$$$type(this) === 'sms') {
                return '/sms/static/img/sms_failure.svg';
            }
            return this._super(...arguments);
        },
    }
);
