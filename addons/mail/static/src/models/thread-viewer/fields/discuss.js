/** @odoo-module alias=mail.models.ThreadViewer.fields.discuss **/

import one2one from 'mail.model.field.one2one.define';

/**
 * States the `Discuss` managing `this`. This field is computed
 * through the inverse relation and should be considered read-only.
 */
export default one2one({
    name: 'discuss',
    id: 'mail.models.ThreadViewer.fields.discuss',
    global: true,
    target: 'Discuss',
    inverse: 'threadViewer',
});
