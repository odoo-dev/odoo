/** @odoo-module **/

import { one, Patch } from '@mail/legacy/model';

Patch({
    name: 'User',
    fields: {
        /**
         * Employee related to this user.
         */
        employee: one('Employee', {
            inverse: 'user',
        }),
    },
});
