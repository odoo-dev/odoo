/** @odoo-module alias=mail.models.Activity.fields.thread **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Determines to which "thread" (using `mail.activity.mixin` on the
 * server) `this` belongs to.
 */
export default many2one({
    name: 'thread',
    id: 'mail.models.Activity.fields.thread',
    global: true,
    target: 'Thread',
    inverse: 'activities',
});
