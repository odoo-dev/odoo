/** @odoo-module alias=mail.models.ThreadCache.fields.threadViews **/

import one2many from 'mail.model.field.one2many.define';

/**
 * States the 'ThreadView' that are currently displaying `this`.
 */
export default one2many({
    name: 'threadViews',
    id: 'mail.models.ThreadCache.fields.threadViews',
    global: true,
    target: 'ThreadView',
    inverse: 'threadCache',
});
