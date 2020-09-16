/** @odoo-module alias=mail.models.Dialog.fields.record **/

import one2one from 'mail.model.field.one2one.define';

/**
 * Content of dialog that is directly linked to a record that models
 * a UI component, such as AttachmentViewer. These records must be
 * created from @see `DialogManager/open`.
 */
export default one2one({
    name: 'manager',
    id: 'mail.models.Dialog.fields.manager',
    global: true,
    target: 'Record',
    isCausal: true,
});
