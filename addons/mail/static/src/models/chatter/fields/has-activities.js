/** @odoo-module alias=mail.models.Chatter.fields.hasActivities **/

import attr from 'mail.model.fields.attr.define';

/**
 * Determines whether `this` should display an activity box.
 */
export default attr({
    name: 'hasActivities',
    id: 'mail.models.Chatter.fields.hasActivities',
    global: true,
    default: true,
});
