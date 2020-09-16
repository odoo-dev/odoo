/** @odoo-module alias=mail.models.Discuss.actions.handleAddChannelAutocompleteSource **/

import action from 'mail.action.define';

export default action({
    name: 'Discuss/handleAddChannelAutocompleteSource',
    id: 'mail.models.Discuss.actions.handleAddChannelAutocompleteSource',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Discuss} discuss
     * @param {Object} req
     * @param {string} req.term
     * @param {function} res
     */
    async func(
        { env },
        discuss,
        req,
        res,
    ) {
        const value = req.term;
        const escapedValue = owl.utils.escape(value);
        env.services.action.dispatch(
            'Record/update',
            discuss,
            { addingChannelValue: value },
        );
        const domain = [
            ['channel_type', '=', 'channel'],
            ['name', 'ilike', value],
        ];
        const fields = ['channel_type', 'name', 'public', 'uuid'];
        const result = await env.services.action.dispatch(
            'Record/doAsync',
            discuss,
            () => env.services.rpc({
                model: 'mail.channel',
                method: 'search_read',
                kwargs: {
                    domain,
                    fields,
                },
            }),
        );
        const items = result.map(
            data => {
                const escapedName = owl.utils.escape(data.name);
                return {
                    ...data,
                    label: escapedName,
                    value: escapedName
                };
            },
        );
        // XDU FIXME could use a component but be careful with owl's
        // renderToString https://github.com/odoo/owl/issues/708
        items.push({
            label: _.str.sprintf(
                `<strong>${env._t("Create %s")}</strong>`,
                `<em><span class="fa fa-hashtag"/>${escapedValue}</em>`,
            ),
            escapedValue,
            special: 'public',
        }, {
            label: _.str.sprintf(
                `<strong>${env._t("Create %s")}</strong>`,
                `<em><span class="fa fa-lock"/>${escapedValue}</em>`,
            ),
            escapedValue,
            special: 'private',
        });
        res(items);
    },
});
