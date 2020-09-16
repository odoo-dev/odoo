/** @odoo-module alias=mail.models.SuggestedRecipientInfo.fields.thread **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Determines the `Thread` concerned by `this.`
 */
export default many2one({
    name: 'thread',
    id: 'mail.models.SuggestedRecipientInfo.fields.thread',
    global: true,
    target: 'Thread',
    inverse: 'suggestedRecipientInfoList',
});
