/** @odoo-module alias=mail.models.Discuss.actions.handleAddChatAutocompleteSource **/

import action from 'mail.action.define';

export default action({
    name: 'Discuss/handleAddChatAutocompleteSource',
    id: 'mail.models.Discuss.actions.handleAddChatAutocompleteSource',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Discuss} discuss
     * @param {Object} req
     * @param {string} req.term
     * @param {function} res
     */
    func(
        { ctx, env },
        discuss,
        req,
        res,
    ) {
        const value = owl.utils.escape(req.term);
        env.services.action.dispatch(
            'Partner/imSearch',
            {
                callback: partners => {
                    const suggestions = partners.map(partner => {
                        return {
                            id: partner.id(ctx),
                            value: partner.nameOrDisplayName(ctx),
                            label: partner.nameOrDisplayName(ctx),
                        };
                    });
                    res(_.sortBy(suggestions, 'label'));
                },
                keyword: value,
                limit: 10,
            },
        );
    },
});
