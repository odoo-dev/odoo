/** @odoo-module alias=mail.models.Composer.fields.mentionedChannels **/

import many2many from 'mail.model.field.many2many.define';

/**
 * Detects if mentioned channels are still in the composer text input content
 * and removes them if not.
 */
export default many2many({
    name: 'mentionedChannels',
    id: 'mail.models.Composer.fields.mentionedChannels',
    global: true,
    target: 'Thread',
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Composer} param0.record
     * @returns {Partner[]}
    */
    compute({ ctx, env, record }) {
        const unmentionedChannels = [];
        // ensure the same mention is not used multiple times if multiple
        // channels have the same name
        const namesIndex = {};
        for (const channel of record.mentionedChannels(ctx)) {
            const fromIndex = namesIndex[channel.name(ctx)] !== undefined
                ? namesIndex[channel.name(ctx)] + 1
                : 0;
            const index = record.textInputContent(ctx).indexOf(
                `#${channel.name(ctx)}`,
                fromIndex,
            );
            if (index !== -1) {
                namesIndex[channel.name(ctx)] = index;
            } else {
                unmentionedChannels.push(channel);
            }
        }
        return env.services.action.dispatch(
            'RecordFieldCommand/unlink',
            unmentionedChannels,
        );
    },
});
