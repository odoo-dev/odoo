/** @odoo-module alias=mail.models.Discuss.fields.initActiveId **/

import attr from 'mail.model.field.attr.define';

/**
 * Formatted init thread on opening discuss for the first time,
 * when no active thread is defined. Useful to set a thread to
 * open without knowing its local id in advance.
 * Support two formats:
 *    {string} <threadModel>_<threadId>
 *    {int} <channelId> with default model of 'mail.channel'
 */
export default attr({
    name: 'initActiveId',
    id: 'mail.models.Discuss.fields.initActiveId',
    global: true,
    default: 'mail.box_inbox',
});
