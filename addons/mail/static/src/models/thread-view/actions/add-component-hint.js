/** @odoo-module alias=mail.models.ThreadView.actions.addComponentHint **/

import action from 'mail.action.define';

/**
 * This function register a hint for the component related to this
 * record. Hints are information on changes around this viewer that
 * make require adjustment on the component. For instance, if this
 * ThreadView initiated a thread cache load and it now has become
 * loaded, then it may need to auto-scroll to last message.
 */
export default action({
    name: 'ThreadView/addComponentHint',
    id: 'mail.models.ThreadView.actions.addComponentHint',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadView} threadView
     * @param {string} hintType name of the hint. Used to determine what's
     *   the broad type of adjustement the component has to do.
     * @param {any} [hintData] data of the hint. Used to fine-tune
     *   adjustments on the component.
     */
    func(
        { ctx, env },
        threadView,
        hintType,
        hintData,
    ) {
        const hint = {
            data: hintData,
            type: hintType,
        };
        env.services.action.dispatch(
            'Record/update',
            threadView,
            {
                componentHintList: threadView.componentHintList(ctx).concat([hint]),
            },
        );
    },
});
