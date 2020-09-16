/** @odoo-module alias=mail.models.ChatWindow.actions._getNextVisibleUnfoldedChatWindow **/

import action from 'mail.action.define';

/**
 * Cycles to the next possible visible and unfolded chat window starting
 * from the `currentChatWindow`, following the natural order based on the
 * current text direction, and with the possibility to `reverse` based on
 * the given parameter.
 */
export default action({
    name: 'ChatWindow/_getNextVisibleUnfoldedChatWindow',
    id: 'mail.models.ChatWindow.actions._getNextVisibleUnfoldedChatWindow',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {ChatWindow} chatWindow
     * @param {Object} [param2={}]
     * @param {boolean} [param2.reverse=false]
     * @returns {ChatWindow|undefined}
     */
    func(
        { ctx },
        chatWindow,
        { reverse = false } = {},
    ) {
        const orderedVisible = chatWindow.manager(ctx).allOrderedVisible(ctx);
        /**
         * Return index of next visible chat window of a given visible chat
         * window index. The direction of "next" chat window depends on
         * `reverse` option.
         *
         * @param {integer} index
         * @returns {integer}
         */
        const _getNextIndex = index => {
            const directionOffset = reverse ? 1 : -1;
            let nextIndex = index + directionOffset;
            if (nextIndex > orderedVisible.length - 1) {
                nextIndex = 0;
            }
            if (nextIndex < 0) {
                nextIndex = orderedVisible.length - 1;
            }
            return nextIndex;
        };
        const currentIndex = orderedVisible.findIndex(
            visible => visible === chatWindow,
        );
        let nextIndex = _getNextIndex(currentIndex);
        let nextToFocus = orderedVisible[nextIndex];
        while (nextToFocus.isFolded) {
            nextIndex = _getNextIndex(nextIndex);
            nextToFocus = orderedVisible[nextIndex];
        }
        return nextToFocus;
    },
});
