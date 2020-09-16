/** @odoo-module alias=mail.models.ThreadViewer.fields.threadCacheInitialScrollHeights **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines the initial scroll height of thread caches, which is the
 * scroll height at the time the last scroll position was saved.
 * Useful to only restore scroll position when the corresponding height
 * is available, otherwise the restore makes no sense.
 */
export default attr({
    name: 'threadCacheInitialScrollHeights',
    id: 'mail.models.ThreadViewer.fields.threadCacheInitialScrollHeights',
    global: true,
    default: {},
});
