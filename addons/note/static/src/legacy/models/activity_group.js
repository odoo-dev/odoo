/** @odoo-module **/

import { attr, Patch } from '@mail/legacy/model';

Patch({
    name: 'ActivityGroup',
    fields: {
        isNote: attr({
            compute() {
                return this.irModel.model === 'note.note';
            },
        }),
    },
});
