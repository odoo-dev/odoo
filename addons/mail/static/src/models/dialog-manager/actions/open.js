/** @odoo-module alias=mail.models.DialogManager **/

import action from 'mail.action.define';

export default action({
    name: 'DialogManager/open',
    id: 'mail.models.DialogManager.actions.open',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {DialogManager} dialogManager
     * @param {string} modelName
     * @param {Object} [recordData]
     */
    'DialogManager/open'(
        { env },
        dialogManager,
        modelName,
        recordData,
    ) {
        if (!modelName) {
            throw new Error("Dialog should have a link to a model");
        }
        const record = env.services.action.dispatch(
            `${modelName}/create`,
            recordData,
        );
        const dialog = env.services.action.dispatch(
            'Dialog/create',
            {
                manager: env.services.action.dispatch(
                    'RecordFieldCommand/link',
                    dialogManager,
                ),
                record: env.services.action.dispatch(
                    'RecordFieldCommand/link',
                    record,
                ),
            },
        );
        return dialog;
    },
});
