/** @odoo-module alias=mail.models.Composer.actions._updateSuggestedChannelCommands **/

import action from 'mail.action.define';

export default action({
    name: 'Composer/_updateSuggestedChannelCommands',
    id: 'mail.models.Composer.actions._updateSuggestedChannelCommands',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Composer} composer
     * @param {string} mentionKeyword
     */
    func(
        { ctx, env },
        composer,
        mentionKeyword,
    ) {
        const commands = env.services.model.messaging.commands(ctx).filter(
            command => {
                if (!command.name(ctx).includes(mentionKeyword)) {
                    return false;
                }
                if (command.channelTypes(ctx)) {
                    return command.channelTypes(ctx).includes(
                        composer.thread(ctx).channelType(ctx),
                    );
                }
                return true;
            },
        );
        env.services.action.dispatch(
            'Record/update',
            composer,
            {
                suggestedChannelCommands: env.services.action.dispatch(
                    'RecordFieldCommand/replace',
                    commands,
                ),
            },
        );
        if (composer.suggestedChannelCommands(ctx)[0]) {
            env.services.action.dispatch(
                'Record/update',
                composer,
                {
                    activeSuggestedChannelCommand:
                        env.services.action.dispatch(
                            'RecordFieldCommand/link',
                            composer.suggestedChannelCommands(ctx)[0],
                        ),
                    hasToScrollToActiveSuggestion: true,
                },
            );
        } else {
            env.services.action.dispatch(
                'Record/update',
                composer,
                {
                    activeSuggestedChannelCommand:
                        env.services.action.dispatch(
                            'RecordFieldCommand/unlink',
                        ),
                },
            );
        }
    },
});
