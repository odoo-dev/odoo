/** @odoo-module alias=website_livechat.modelAddons.Thread.fields.visitor **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Visitor connected to the livechat.
 */
export default many2one({
    name: 'visitor',
    id: 'website_livechat.modelAddons.Thread.fields.visitor',
    global: true,
    target: 'Visitor',
    inverse: 'threads',
});
