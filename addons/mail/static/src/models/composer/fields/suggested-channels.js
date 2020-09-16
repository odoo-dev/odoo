/** @odoo-module alias=mail.models.Composer.fields.suggestedChannels **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'suggestedChannels',
    id: 'mail.models.Composer.fields.suggestedChannels',
    global: true,
    target: 'Thread',
});
