/** @odoo-module alias=mail.models.Composer.fields.activeSuggestedChannel **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'activeSuggestedChannel',
    id: 'mail.models.Composer.fields.activeSuggestedChannel',
    global: true,
    target: 'Thread',
});
