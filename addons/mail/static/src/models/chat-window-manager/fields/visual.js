/** @odoo-module alias=mail.models.ChatWindowManager.fields.visual **/

import attr from 'mail.model.field.attr.define';

const BASE_VISUAL = {
    /**
     * Amount of visible slots available for chat windows.
     */
    availableVisibleSlots: 0,
    /**
     * Data related to the hidden menu.
     */
    hidden: {
        /**
         * List of hidden docked chat windows. Useful to compute counter.
         * Chat windows are ordered by their `chatWindows` order.
         */
        chatWindowLocalIds: [],
        /**
         * Whether hidden menu is visible or not
         */
        isVisible: false,
        /**
         * Offset of hidden menu starting point from the starting point
         * of chat window manager. Makes only sense if it is visible.
         */
        offset: 0,
    },
    /**
     * Data related to visible chat windows. Index determine order of
     * docked chat windows.
     *
     * Value:
     *
     *  {
     *      chatWindowLocalId,
     *      offset,
     *  }
     *
     * Offset is offset of starting point of docked chat window from
     * starting point of dock chat window manager. Docked chat windows
     * are ordered by their `chatWindows` order
     */
    visible: [],
};

export default attr({
    name: 'visual',
    id: 'mail.models.ChatWindowManager.fields.visual',
    global: true,
    default: BASE_VISUAL,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ChatWindowManager} param0.record
     * @returns {Object}
     */
    compute({ ctx, env, record }) {
        let visual = JSON.parse(JSON.stringify(BASE_VISUAL));
        if (!env.services.model.messaging) {
            return visual;
        }
        const device = env.services.model.messaging.device(ctx);
        const discuss = env.services.model.messaging.discuss(ctx);
        const BETWEEN_GAP_WIDTH = 5;
        const CHAT_WINDOW_WIDTH = 325;
        const END_GAP_WIDTH = device.isMobile(ctx) ? 0 : 10;
        const GLOBAL_WINDOW_WIDTH = device.globalWindowInnerWidth(ctx);
        const HIDDEN_MENU_WIDTH = 200; // max width, including width of dropup list items
        const START_GAP_WIDTH = device.isMobile(ctx) ? 0 : 10;
        const chatWindows = record.allOrdered(ctx);
        if (!device.isMobile(ctx) && discuss.isOpen(ctx)) {
            return visual;
        }
        if (!chatWindows.length) {
            return visual;
        }
        const relativeGlobalWindowWidth = (
            GLOBAL_WINDOW_WIDTH -
            START_GAP_WIDTH -
            END_GAP_WIDTH
        );
        let maxAmountWithoutHidden = Math.floor(
            relativeGlobalWindowWidth /
            (CHAT_WINDOW_WIDTH + BETWEEN_GAP_WIDTH)
        );
        let maxAmountWithHidden = Math.floor(
            (
                relativeGlobalWindowWidth -
                HIDDEN_MENU_WIDTH -
                BETWEEN_GAP_WIDTH
            ) /
            (CHAT_WINDOW_WIDTH + BETWEEN_GAP_WIDTH)
        );
        if (device.isMobile(ctx)) {
            maxAmountWithoutHidden = 1;
            maxAmountWithHidden = 1;
        }
        if (chatWindows.length <= maxAmountWithoutHidden) {
            // all visible
            for (let i = 0; i < chatWindows.length; i++) {
                const chatWindowLocalId = chatWindows[i].localId;
                const offset = (
                    START_GAP_WIDTH +
                    i * (CHAT_WINDOW_WIDTH + BETWEEN_GAP_WIDTH)
                );
                visual.visible.push({ chatWindowLocalId, offset });
            }
            visual.availableVisibleSlots = maxAmountWithoutHidden;
        } else if (maxAmountWithHidden > 0) {
            // some visible, some hidden
            for (let i = 0; i < maxAmountWithHidden; i++) {
                const chatWindowLocalId = chatWindows[i].localId;
                const offset = (
                    START_GAP_WIDTH +
                    i * (CHAT_WINDOW_WIDTH + BETWEEN_GAP_WIDTH)
                );
                visual.visible.push({ chatWindowLocalId, offset });
            }
            if (chatWindows.length > maxAmountWithHidden) {
                visual.hidden.isVisible = !device.isMobile(ctx);
                visual.hidden.offset = (
                    visual.visible[maxAmountWithHidden - 1].offset +
                    CHAT_WINDOW_WIDTH +
                    BETWEEN_GAP_WIDTH
                );
            }
            for (let j = maxAmountWithHidden; j < chatWindows.length; j++) {
                visual.hidden.chatWindowLocalIds.push(chatWindows[j].localId);
            }
            visual.availableVisibleSlots = maxAmountWithHidden;
        } else {
            // all hidden
            visual.hidden.isVisible = !device.isMobile(ctx);
            visual.hidden.offset = START_GAP_WIDTH;
            visual.hidden.chatWindowLocalIds.concat(
                chatWindows.map(chatWindow => chatWindow.localId)
            );
            console.warn('cannot display any visible chat windows (screen is too small)');
            visual.availableVisibleSlots = 0;
        }
        return visual;
    },
});
