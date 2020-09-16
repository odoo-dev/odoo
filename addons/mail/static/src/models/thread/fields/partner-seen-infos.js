/** @odoo-module alias=mail.models.Thread.fields.partnerSeenInfos **/

import one2many from 'mail.model.field.one2many.define';

/**
 * Contains the seen information for all members of the thread.
 * FIXME This field should be readonly once task-2336946 is done.
 */
export default one2many({
    name: 'partnerSeenInfos',
    id: 'mail.models.Thread.fields.partnerSeenInfos',
    global: true,
    target: 'ThreadPartnerSeenInfo',
    inverse: 'thread',
    isCausal: true,
});
