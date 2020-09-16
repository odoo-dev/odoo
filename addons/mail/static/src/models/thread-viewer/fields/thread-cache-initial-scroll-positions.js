/** @odoo-module alias=mail.models.ThreadViewer.fields.threadCacheInitialScrollPositions **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines the initial scroll positions of thread caches.
 * Useful to restore scroll position on changing back to this
 * thread cache. Note that this is only applied when opening
 * the thread cache, because scroll position may change fast so
 * save is already throttled.
 */
export default attr({
    name: 'threadCacheInitialScrollPositions',
    id: 'mail.models.ThreadViewer.fields.threadCacheInitialScrollPositions',
    global: true,
    default: {},
});
