/** @odoo-module alias=mail.models.Thread.actions.fetchAttachments **/

import action from 'mail.action.define';

/**
 * Fetch attachments linked to a record. Useful for populating the store
 * with these attachments, which are used by attachment box in the chatter.
 */
export default action({
    name: 'Thread/fetchAttachments',
    id: 'mail.models.Thread.actions.fetchAttachments',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Thread} thread
     */
    async func(
        { ctx, env },
        thread,
    ) {
        const attachmentsData = await env.services.action.dispatch(
            'Record/doAsync',
            thread,
            () => env.services.rpc({
                model: 'ir.attachment',
                method: 'search_read',
                domain: [
                    ['res_id', '=', thread.id(ctx)],
                    ['res_model', '=', thread.model(ctx)],
                ],
                fields: ['id', 'name', 'mimetype'],
                orderBy: [{ name: 'id', asc: false }],
            }, { shadow: true }),
        );
        env.services.action.dispatch(
            'Record/update',
            thread,
            {
                originThreadAttachments: env.services.action.dispatch(
                    'RecordFieldCommand/insertAndReplace',
                    attachmentsData.map(
                        data => env.services.action.dispatch(
                            'Attachment/convertData',
                            data,
                        ),
                    ),
                ),
            },
        );
        env.services.action.dispatch(
            'Record/update',
            thread,
            { areAttachmentsLoaded: true },
        );
    },
});
