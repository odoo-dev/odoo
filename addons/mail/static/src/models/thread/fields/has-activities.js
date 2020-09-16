/** @odoo-module alias=mail.models.Thread.fields.hasActivities **/

import attr from 'mail.model.field.attr.define';

/**
 * States whether `this` has activities (`mail.activity.mixin` server side).
 */
export default attr({
    name: 'hasActivities',
    id: 'mail.models.Thread.fields.hasActivities',
    global: true,
    default: false,
});
