/** @odoo-module alias=mail.models.MessageSeenIndicator.actions.recomputeSeenValues **/

import action from 'mail.action.define';

export default action({
    name: 'MessageSeenIndicator/recomputeSeenValues',
    id: 'mail.models.MessageSeenIndicator.actions.recomputeSeenValues',
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
                    hasEveryoneSeen:
                        env.services.action.dispatch(
                            'MessageSeenIndicator/_computeHasEveryoneSeen',
                            indicator,
                        ),
                    hasSomeoneFetched:
                        env.services.action.dispatch(
                            'MessageSeenIndicator/_computeHasSomeoneFetched',
                            indicator,
                        ),
                    hasSomeoneSeen:
                        env.services.action.dispatch(
                            'MessageSeenIndicator/_computeHasSomeoneSeen',
                            indicator,
                        ),
                    isMessagePreviousToLastCurrentPartnerMessageSeenByEveryone:
                        env.services.action.dispatch(
                            'MessageSeenIndicator/_computeIsMessagePreviousToLastCurrentPartnerMessageSeenByEveryone',
                            indicator,
                        ),
                    partnersThatHaveFetched:
                        env.services.action.dispatch(
                            'MessageSeenIndicator/_computePartnersThatHaveFetched',
                            indicator,
                        ),
                    partnersThatHaveSeen:
                        env.services.action.dispatch(
                            'MessageSeenIndicator/_computePartnersThatHaveSeen',
                            indicator,
                        ),
                },
            );
        }
    },
});
