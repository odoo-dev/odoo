/** @odoo-module alias=mail.models.Thread.fields.activities **/

import one2many from 'mail.model.field.one2many.define';

/**
 * Determines the `Activity` that belong to `this`, assuming `this`
 * has activities (@see hasActivities).
 */
export default one2many({
    name: 'activities',
    id: 'mail.models.Thread.fields.activities',
    global: true,
    target: 'Activity',
    inverse: 'thread',
});
