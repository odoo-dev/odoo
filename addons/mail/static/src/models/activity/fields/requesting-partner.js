/** @odoo-module alias=mail.models.Activity.fields.requestingPartner **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Determines that an activity is linked to a requesting partner or not.
 * It will be used notably in website slides to know who triggered the
 * "request access" activity.
 * Also, be useful when the assigned user is different from the
 * "source" or "requesting" partner.
 */
export default many2one({
    name: 'requestingPartner',
    id: 'mail.models.Activity.fields.requestingPartner',
    global: true,
    target: 'Partner',
});
