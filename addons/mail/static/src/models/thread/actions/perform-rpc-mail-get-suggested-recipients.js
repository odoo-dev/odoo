/** @odoo-module alias=mail.models.Thread.actions.performRpcMailGetSuggestedRecipients **/

import action from 'mail.action.define';
import parseEmail from 'mail.utils.parseEmail';

/**
 * Performs RPC on the route `/mail/get_suggested_recipients`.
 */
export default action({
    name: 'Thread/performRpcMailGetSuggestedRecipients',
    id: 'mail.models.Thread.actions.performRpcMailGetSuggestedRecipients',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Object} param1
     * @param {string} param1.model
     * @param {integer[]} param1.res_ids
     */
    async func(
        { env },
        {
            model,
            res_ids,
        },
    ) {
        const data = await env.services.rpc({
            route: '/mail/get_suggested_recipients',
            params: {
                model,
                res_ids,
            },
        }, { shadow: true });
        for (const id in data) {
            const recipientInfoList = data[id].map(
                recipientInfoData => {
                    const [partner_id, emailInfo, reason] = recipientInfoData;
                    const [name, email] = emailInfo && parseEmail(emailInfo);
                    return {
                        email,
                        name,
                        partner: partner_id
                            ? env.services.action.dispatch(
                                'RecordFieldCommand/insert',
                                { id: partner_id },
                            )
                            : env.services.action.dispatch('RecordFieldCommand/unlink'),
                        reason,
                    };
                },
            );
            env.services.action.dispatch(
                'Thread/insert',
                {
                    id: parseInt(id),
                    model: model,
                    suggestedRecipientInfoList: env.services.action.dispatch(
                        'RecordFieldCommand/insertAndReplace',
                        recipientInfoList,
                    ),
                },
            );
        }
    },
});
