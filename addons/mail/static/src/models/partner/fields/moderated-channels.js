/** @odoo-module alias=mail.models.Partner.fields.moderatedChannels **/

import many2many from 'mail.model.field.many2many.define';

/**
 * Channels that are moderated by this partner.
 */
export default many2many({
    name: 'moderatedChannels',
    id: 'mail.models.Partner.fields.moderatedChannels',
    global: true,
    target: 'Thread',
    inverse: 'moderators',
});
