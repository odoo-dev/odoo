/** @odoo-module alias=mail.models.ThreadView.fields.hasComposerFocus **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'hasComposerFocus',
    id: 'mail.models.ThreadView.fields.hasComposerFocus',
    global: true,
    related: 'composer.hasFocus',
});
