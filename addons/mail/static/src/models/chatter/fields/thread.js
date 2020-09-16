/** @odoo-module alias=mail.models.Chatter.fields.thread **/

import many2one from 'mail.model.fields.many2one.define';

/**
 * Determines the `Thread` that should be displayed by `this`.
 */
export default many2one({
    name: 'thread',
    id: 'mail.models.Chatter.fields.thread',
    global: true,
    target: 'Thread',
});
