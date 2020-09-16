/** @odoo-module alias=mail.models.Chatter.fields.hasMessageListScrollAdjust **/

import attr from 'mail.model.fields.attr.define';

/**
 * Whether the message list should manage its scroll.
 * In particular, when the chatter is on the form view's side,
 * then the scroll is managed by the message list.
 * Also, the message list shoud not manage the scroll if it shares it
 * with the rest of the page.
 */
export default attr({
    name: 'hasMessageListScrollAdjust',
    id: 'mail.models.Chatter.fields.hasMessageListScrollAdjust',
    global: true,
    default: false,
});
