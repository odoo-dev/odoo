/** @odoo-module **/

import { attr, Patch } from '@mail/legacy/model';

Patch({
    name: 'Messaging',
    fields: {
        isWebsitePreviewOpen: attr({
            default: false,
        }),
    },
});
