/** @odoo-module alias=mail.models.ThreadView.fields.threadCacheInitialScrollPositions **/

import attr from 'mail.model.field.attr.define';

/**
 * List of saved initial scroll positions of thread caches.
 */
export default attr({
    name: 'threadCacheInitialScrollPositions',
    id: 'mail.models.ThreadView.fields.threadCacheInitialScrollPositions',
    global: true,
    related: 'threadViewer.threadCacheInitialScrollPositions',
    default: {},
});
