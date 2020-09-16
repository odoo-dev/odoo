/** @odoo-module alias=mail.models.ThreadView.fields.isLoading **/

import attr from 'mail.model.field.attr.define';

/**
 * States whether `this.threadCache` is currently loading messages.
 *
 * This field is related to `this.threadCache.isLoading` but with a
 * delay on its update to avoid flickering on the UI.
 *
 * It is computed through `_onThreadCacheIsLoadingChanged` and it should
 * otherwise be considered read-only.
 */
export default attr({
    name: 'isLoading',
    id: 'mail.models.ThreadView.fields.isLoading',
    global: true,
    default: false,
});
