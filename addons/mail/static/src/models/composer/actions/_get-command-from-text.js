/** @odoo-module alias=mail.models.Composer.actions._getCommandFromText **/

import action from 'mail.action.define';

export default action({
    name: 'Composer/_getCommandFromText',
    id: 'mail.models.Composer.actions._getCommandFromText',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Composer} composer
     * @param {string} content html content
     * @returns {ChannelCommand|undefined} command, if any in the content
     */
    func(
        { ctx, env },
        composer,
        content,
    ) {
        if (content.startsWith('/')) {
            const firstWord = content.substring(1).split(/\s/)[0];
            return env.services.model.messaging.commands(ctx).find(
                command => {
                    if (command.name(ctx) !== firstWord) {
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
        }
        return undefined;
    },
});
