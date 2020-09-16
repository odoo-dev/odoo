/** @odoo-module alias=im_livechat.modelAddons.Thread **/

import actionAddon from 'mail.action.addon.define';

export default actionAddon({
    actionName: 'Thread/convertData',
    id: 'im_livechat.modelAddons.Thread.actionAddons.convertData',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {function} param0.original
     * @param {Object} data
     */
    func(
        { env, original },
        data,
    ) {
        const data2 = original(data);
        if ('livechat_visitor' in data && data.livechat_visitor) {
            if (!data2.members) {
                data2.members = [];
            }
            // `livechat_visitor` without `id` is the anonymous visitor.
            if (!data.livechat_visitor.id) {
                /**
                 * Create partner derived from public partner and replace the
                 * public partner.
                 *
                 * Indeed the anonymous visitor is registered as a member of the
                 * channel as the public partner in the database to avoid
                 * polluting the contact list with many temporary partners.
                 *
                 * But the issue with public partner is that it is the same
                 * record for every livechat, whereas every correspondent should
                 * actually have its own visitor name, typing status, etc.
                 *
                 * Due to JS being temporary by nature there is no such notion
                 * of polluting the database, it is therefore acceptable and
                 * easier to handle one temporary partner per channel.
                 */
                data2.members.push(
                    env.services.action.dispatch(
                        'RecordFieldCommand/unlink',
                        env.services.model.messaging.publicPartners(),
                    ),
                );
                const partner = env.services.action.dispatch(
                    'Partner/create',
                    {
                        ...env.services.action.dispatch(
                            'Partner/convertData',
                            data.livechat_visitor,
                        ),
                        id: env.services.action.dispatch(
                            'Partner/getNextPublicId',
                        ),
                    },
                );
                data2.members.push(
                    env.services.action.dispatch(
                        'RecordFieldCommand/link',
                        partner,
                    )
                );
                data2.correspondent = env.services.action.dispatch(
                    'RecordFieldCommand/link',
                    partner,
                );
            } else {
                const partnerData = env.services.action.dispatch(
                    'Partner/convertData',
                    data.livechat_visitor,
                );
                data2.members.push(
                    env.services.action.dispatch(
                        'RecordFieldCommand/insert',
                        partnerData,
                    )
                );
                data2.correspondent = env.services.action.dispatch(
                    'RecordFieldCommand/insert',
                    partnerData,
                );
            }
        }
        return data2;
    },
});
