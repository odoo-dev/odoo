/** @odoo-module alias=mail.models.Composer.actions._executeOrQueueFunction **/

import action from 'mail.action.define';

/**
 * Executes the given async function, only when the last function
 * executed by this method terminates. If there is already a pending
 * function it is replaced by the new one. This ensures the result of
 * these function come in the same order as the call order, and it also
 * allows to skip obsolete intermediate calls.
 */
export default action({
    name: 'Composer/_executeOrQueueFunction',
    id: 'mail.models.Composer.actions._executeOrQueueFunction',
    global: true,
    /**
     * @private
     * @param {function} func
     */
    async func(
        { env },
        composer,
        func,
    ) {
        if (composer._hasMentionRpcInProgress) {
            composer._nextMentionRpcFunction = func;
            return;
        }
        composer._hasMentionRpcInProgress = true;
        composer._nextMentionRpcFunction = undefined;
        try {
            await env.services.action.dispatch(
                'Record/doAsync',
                composer,
                func,
            );
        } finally {
            composer._hasMentionRpcInProgress = false;
            if (composer._nextMentionRpcFunction) {
                env.services.action.dispatch(
                    'Composer/_executeOrQueueFunction',
                    composer,
                    composer._nextMentionRpcFunction,
                );
            }
        }
    },
});
