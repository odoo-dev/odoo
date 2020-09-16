/** @odoo-module alias=website_livechat.models.Visitor.fields.threads **/

import one2many from 'mail.model.field.one2many.define';

/**
 * Threads with this visitor as member
 */
export default one2many({
    name: 'threads',
    id: 'website_livechat.models.Visitor.fields.threads',
    global: true,
    target: 'Thread',
    inverse: 'visitor',
});
