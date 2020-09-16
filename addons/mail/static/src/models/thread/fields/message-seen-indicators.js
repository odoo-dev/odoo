/** @odoo-module alias=mail.models.Thread.fields.messageSeenIndicators **/

import one2many from 'mail.model.field.one2many.define';

/**
 * Contains the message fetched/seen indicators for all messages of this thread.
 * FIXME This field should be readonly once task-2336946 is done.
 */
export default one2many({
    name: 'messageSeenIndicators',
    id: 'mail.models.Thread.fields.messageSeenIndicators',
    global: true,
    target: 'MessageSeenIndicator',
    inverse: 'thread',
    isCausal: true,
});
