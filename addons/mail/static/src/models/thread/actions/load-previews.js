/** @odoo-module alias=mail.models.Thread.actions.loadPreviews **/

import action from 'mail.action.define';

/**
 * Load the previews of the specified threads. Basically, it fetches the
 * last messages, since they are used to display inline content of them.
 */
export default action({
    name: 'Thread/loadPreviews',
    id: 'mail.models.Thread.actions.loadPreviews',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Thread[]} threads
     */
    async func(
        { env },
        threads,
    ) {
        const channelIds = threads.reduce(
            (list, thread) => {
                if (thread.model() === 'mail.channel') {
                    return list.concat(thread.id());
                }
                return list;
            },
            [],
        );
        if (channelIds.length === 0) {
            return;
        }
        const channelPreviews = await env.services.rpc({
            model: 'mail.channel',
            method: 'channel_fetch_preview',
            args: [channelIds],
        }, { shadow: true });
        env.services.action.dispatch(
            'Message/insert',
            channelPreviews
                .filter(p => p.last_message)
                .map(
                    channelPreview => env.services.action.dispatch(
                        'Message/convertData',
                        channelPreview.last_message,
                    ),
                ),
        );
    },
});
