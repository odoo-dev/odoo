/** @odoo-module **/

import { attr, Patch } from '@mail/legacy/model';

Patch({
    name: 'ThreadNeedactionPreviewView',
    fields: {
        isEmpty: {
            compute() {
                return this.isRating || this._super();
            },
        },
        isRating: attr({
            compute() {
                return Boolean(this.thread.lastNeedactionMessageAsOriginThread && this.thread.lastNeedactionMessageAsOriginThread.rating);
            },
        }),
    },
});
