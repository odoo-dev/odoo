/** @odoo-module alias=mail.models.Thread.fields.moderators **/

import many2many from 'mail.model.field.many2many.define';

/**
 * Partners that are moderating this thread (only applies to channels).
 */
export default many2many({
    name: 'moderators',
    id: 'mail.models.Thread.fields.moderators',
    global: true,
    target: 'Partner',
    inverse: 'moderatedChannels',
});
