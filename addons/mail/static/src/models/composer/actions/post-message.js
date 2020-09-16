/** @odoo-module alias=mail.models.Composer.actions.postMessage **/

import action from 'mail.action.define';
import addLink from 'mail.utils.addLink';
import escapeAndCompactTextContent from 'mail.utils.escapeAndCompactTextContent';
import parseAndTransform from 'mail.utils.parseAndTransform';

/**
 * Post a message in provided composer's thread based on current composer
 * fields values.
 */
export default action({
    name: 'Composer/postMessage',
    id: 'mail.models.Composer.actions.postMessage',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Composer} composer
     */
    async func(
        { ctx, env },
        composer,
    ) {
        const thread = composer.thread(ctx);
        env.services.action.dispatch(
            'Thread/unregisterCurrentPartnerIsTyping',
            composer.thread(ctx),
            { immediateNotify: true },
        );
        const escapedAndCompactContent = escapeAndCompactTextContent(
            composer.textInputContent(ctx),
        );
        let body = escapedAndCompactContent.replace(/&nbsp;/g, ' ').trim();
        // This message will be received from the mail composer as html content
        // subtype but the urls will not be linkified. If the mail composer
        // takes the responsibility to linkify the urls we end up with double
        // linkification a bit everywhere. Ideally we want to keep the content
        // as text internally and only make html enrichment at display time but
        // the current design makes this quite hard to do.
        body = env.services.action.dispatch(
            'Composer/_generateMentionsLinks',
            composer,
            body,
        );
        body = parseAndTransform(body, addLink);
        body = env.services.action.dispatch(
            'Composer/_generateEmojisOnHtml',
            composer,
            body,
        );
        let postData = {
            attachment_ids: composer.attachments(ctx).map(
                attachment => attachment.id(ctx),
            ),
            body,
            channel_ids: composer.mentionedChannels(ctx).map(
                channel => channel.id(ctx),
            ),
            message_type: 'comment',
            partner_ids: composer.recipients(ctx).map(
                partner => partner.id(ctx),
            ),
        };
        if (composer.subjectContent(ctx)) {
            postData.subject = composer.subjectContent(ctx);
        }

        try {
            let messageId;
            env.services.action.dispatch(
                'Record/update',
                composer,
                { isPostingMessage: true },
            );
            if (thread.model(ctx) === 'mail.channel') {
                const command = env.services.action.dispatch(
                    'Composer/_getCommandFromText',
                    composer,
                    body,
                );
                Object.assign(postData, {
                    subtype_xmlid: 'mail.mt_comment',
                });
                if (command) {
                    messageId = await env.services.action.dispatch(
                        'Record/doAsync',
                        composer,
                        () => env.services.action.dispatch(
                            'Thread/performRpcExecuteCommand',
                            {
                                channelId: thread.id(ctx),
                                command: command.name(ctx),
                                postData,
                            },
                        ),
                    );
                } else {
                    messageId = await env.services.action.dispatch(
                        'Record/doAsync',
                        composer,
                        () => env.services.action.dispatch(
                            'Thread/performRpcMessagePost',
                            {
                                postData,
                                threadId: thread.id(ctx),
                                threadModel: thread.model(ctx),
                            },
                        ),
                    );
                }
            } else {
                Object.assign(postData, {
                    subtype_xmlid: composer.isLog(ctx)
                        ? 'mail.mt_note'
                        : 'mail.mt_comment',
                });
                if (!composer.isLog(ctx)) {
                    postData.context = {
                        mail_post_autofollow: true,
                    };
                }
                messageId = await env.services.action.dispatch(
                    'Record/doAsync',
                    composer,
                    () => env.services.action.dispatch(
                        'Thread/performRpcMessagePost',
                        {
                            postData,
                            threadId: thread.id(ctx),
                            threadModel: thread.model(ctx),
                        },
                    ),
                );
                const [messageData] = await env.services.action.dispatch(
                    'Record/doAsync',
                    composer,
                    () => env.services.rpc({
                        model: 'mail.message',
                        method: 'message_format',
                        args: [[messageId]],
                    }, { shadow: true }),
                );
                env.services.action.dispatch(
                    'Message/insert',
                    {
                        ...env.services.action.dispatch(
                            'Message/convertData',
                            messageData,
                        ),
                        originThread: env.services.action.dispatch(
                            'RecordFieldCommand/insert',
                            {
                                id: thread.id(ctx),
                                model: thread.model(ctx),
                            },
                        ),
                    },
                );
                env.services.action.dispatch(
                    'Thread/loadNewMessages',
                    thread,
                );
            }
            for (const threadView of composer.thread(ctx).threadViews(ctx)) {
                // Reset auto scroll to be able to see the newly posted message.
                env.services.action.dispatch(
                    'Record/update',
                    threadView,
                    { hasAutoScrollOnMessageReceived: true },
                );
            }
            env.services.action.dispatch(
                'Thread/refreshFollowers',
                thread,
            );
            env.services.action.dispatch(
                'Thread/fetchAndUpdateSuggestedRecipients',
                thread,
            );
            env.services.action.dispatch(
                'Composer/_reset',
                composer,
            );
        } finally {
            env.services.action.dispatch(
                'Record/update',
                composer,
                { isPostingMessage: false },
            );
        }
    },
});
