/** @odoo-module alias=mail.models.ThreadViewer.fields.chatter **/

import one2one from 'mail.model.field.one2one.define';

/**
 * States the `Chatter` managing `this`. This field is computed
 * through the inverse relation and should be considered read-only.
 */
export default one2one({
    name: 'chatter',
    id: 'mail.models.ThreadViewer.fields.chatter',
    global: true,
    target: 'Chatter',
    inverse: 'threadViewer',
});
