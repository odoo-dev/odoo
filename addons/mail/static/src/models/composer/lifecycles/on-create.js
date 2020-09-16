/** @odoo-module alias=mail.models.Composer.lifecycles.onCreate **/

import lifecycle from 'mail.model.lifecycle.define';

export default lifecycle({
    name: 'onCreate',
    id: 'mail.models.Composer.lifecycles.onCreate',
    global: true,
    /**
     * @param {Object} param0
     * @param {Composer} param0.record
     */
    func({ record }) {
        /**
         * Determines whether there is a mention RPC currently in progress.
         * Useful to queue a new call if there is already one pending.
         */
        record._hasMentionRpcInProgress = false;
        /**
         * Determines the next function to execute after the current mention
         * RPC is done, if any.
         */
        record._nextMentionRpcFunction = undefined;
    },
});
