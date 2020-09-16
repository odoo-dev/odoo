/** @odoo-module alias=mail.models.MessageSeenIndicator.actions.recomputeFetchedValues **/

import action from 'mail.action.define';

export default action({
    name: 'MessageSeenIndicator/recomputeFetchedValues',
    id: 'mail.models.MessageSeenIndicator.actions.recomputeFetchedValues',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Thread} [channel] the concerned thread
     */
    func(
        { env },
        channel = undefined,
    ) {
        const indicatorFindFunction = channel
            ? localIndicator => localIndicator.thread() === channel
            : undefined;
        const indicators = env.services.action.dispatch(
            'MessageSeenIndicator/all',
            indicatorFindFunction,
        );
        for (const indicator of indicators) {
            env.services.action.dispatch(
                'Record/update',
                indicator,
                {
                    hasEveryoneFetched:
                        env.services.action.dispatch(
                            'MessageSeenIndicator/_computeHasEveryoneFetched',
                            indicator,
                        ),
                    hasSomeoneFetched:
                        env.services.action.dispatch(
                            'MessageSeenIndicator/_computeHasSomeoneFetched',
                            indicator,
                        ),
                    partnersThatHaveFetched:
                        env.services.action.dispatch(
                            'MessageSeenIndicator/_computePartnersThatHaveFetched',
                            indicator,
                        ),
                },
            );
        }
    },
});
