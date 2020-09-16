/** @odoo-module alias=mail.models.Thread.lifecycles.onCreate **/

import lifecycle from 'mail.model.lifecycle.define';
import throttle from 'mail.utils.throttle';
import Timer from 'mail.utils.Timer';

export default lifecycle({
    name: 'onCreate',
    id: 'mail.models.Thread.lifecycles.onCreate',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Thread} param0.record
     */
    func({ env, record }) {
        /**
         * Timer of current partner that was currently typing something, but
         * there is no change on the input for 5 seconds. This is used
         * in order to automatically notify other members that current
         * partner has stopped typing something, due to making no changes
         * on the composer for some time.
         */
        record._currentPartnerInactiveTypingTimer = new Timer(
            env,
            () => env.services.action.dispatch(
                'Record/doAsync',
                record,
                () => env.services.action.dispatch(
                    'Thread/_onCurrentPartnerInactiveTypingTimeout',
                    record,
                ),
            ),
            5 * 1000,
        );
        /**
         * Last 'is_typing' status of current partner that has been notified
         * to other members. Useful to prevent spamming typing notifications
         * to other members if it hasn't changed. An exception is the
         * current partner long typing scenario where current partner has
         * to re-send the same typing notification from time to time, so
         * that other members do not assume he/she is no longer typing
         * something from not receiving any typing notifications for a
         * very long time.
         *
         * Supported values: true/false/undefined.
         * undefined makes only sense initially and during current partner
         * long typing timeout flow.
         */
        record._currentPartnerLastNotifiedIsTyping = undefined;
        /**
         * Timer of current partner that is typing a very long text. When
         * the other members do not receive any typing notification for a
         * long time, they must assume that the related partner is no longer
         * typing something (e.g. they have closed the browser tab).
         * This is a timer to let other members know that current partner
         * is still typing something, so that they should not assume he/she
         * has stopped typing something.
         */
        record._currentPartnerLongTypingTimer = new Timer(
            env,
            () => env.services.action.dispatch(
                'Record/doAsync',
                record,
                () => env.services.action.dispatch(
                    'Thread/_onCurrentPartnerLongTypingTimeout',
                    record,
                ),
            ),
            50 * 1000,
        );
        /**
         * Determines whether the next request to notify current partner
         * typing status should always result to making RPC, regardless of
         * whether last notified current partner typing status is the same.
         * Most of the time we do not want to notify if value hasn't
         * changed, exception being the long typing scenario of current
         * partner.
         */
        record._forceNotifyNextCurrentPartnerTypingStatus = false;
        /**
         * Registry of timers of partners currently typing in the thread,
         * excluding current partner. This is useful in order to
         * automatically unregister typing members when not receive any
         * typing notification after a long time. Timers are internally
         * indexed by partner records as key. The current partner is
         * ignored in this registry of timers.
         *
         * @see registerOtherMemberTypingMember
         * @see unregisterOtherMemberTypingMember
         */
        record._otherMembersLongTypingTimers = new Map();
        /**
         * Clearable and cancellable throttled version of the
         * `_notifyCurrentPartnerTypingStatus` method.
         * This is useful when the current partner posts a message and
         * types something else afterwards: it must notify immediately that
         * he/she is typing something, instead of waiting for the throttle
         * internal timer.
         *
         * @see _notifyCurrentPartnerTypingStatus
         */
        record._throttleNotifyCurrentPartnerTypingStatus = throttle(
            env,
            ({ isTyping }) => env.services.action.dispatch(
                'Record/doAsync',
                () => env.services.action.dispatch(
                    'Thread/_notifyCurrentPartnerTypingStatus',
                    record,
                    { isTyping },
                ),
            ),
            2.5 * 1000,
        );
    },
});
