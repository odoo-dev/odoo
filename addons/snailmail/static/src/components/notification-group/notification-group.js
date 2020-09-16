/** @odoo-module alias=snailmail.components.NotificationGroup **/

import NotificationGroup from 'mail.components.NotificationGroup';

import { patch } from 'web.utils';

patch(
    NotificationGroup.prototype,
    'snailmail.components.NotificationGroup',
    {

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        /**
         * @override
         */
        image() {
            if (this.group.$$$type(this) === 'snail') {
            return '/snailmail/static/img/snailmail_failure.png';
            }
            return this._super(...arguments);
        },
    }
);
