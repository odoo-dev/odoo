/** @odoo-module alias=mail.models.ThreadView.fields.isPreparingLoading **/

import attr from 'mail.model.field.attr.define';

/**
 * States whether `this` is aware of `this.threadCache` currently
 * loading messages, but `this` is not yet ready to display that loading
 * on the UI.
 *
 * This field is computed through `_onThreadCacheIsLoadingChanged` and
 * it should otherwise be considered read-only.
 *
 * @see `isLoading`
 */
export default attr({
    name: 'isPreparingLoading',
    id: 'mail.models.ThreadView.fields.isPreparingLoading',
    global: true,
    default: false,
});
