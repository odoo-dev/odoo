/** @odoo-module alias=mail.models.Chatter.fields.hasFollowers **/

import attr from 'mail.model.fields.attr.define';

/**
 * Determines whether `this` should display followers menu.
 */
export default attr({
    name: 'hasFollowers',
    id: 'mail.models.Chatter.fields.hasFollowers',
    global: true,
    default: true,
});
