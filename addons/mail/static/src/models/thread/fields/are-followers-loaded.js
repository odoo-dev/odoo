/** @odoo-module alias=mail.models.Thread.fields.areFollowersLoaded **/

import attr from 'mail.model.field.attr.define';

/**
 * States whether followers have been loaded at least once for this
 * thread.
 */
export default attr({
    name: 'areFollowersLoaded',
    id: 'mail.models.Thread.fields.areFollowersLoaded',
    global: true,
    default: false,
});
