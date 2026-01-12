/** @odoo-module **/

import { registry } from "@web/core/registry";
import { reactive } from "@odoo/owl";

export const sidePanelService = {
    start() {
        const state = reactive({
            isOpen: false,
            isFolded: false,
            isPinned: false,
            resModel: null,
            resId: null,
            context: {},
            viewId: false,
        });

        return {
            open(resModel, resId, context = {}, viewId = false) {
                state.isOpen = true;
                state.resModel = resModel;
                state.resId = resId;
                state.context = context;
                state.viewId = viewId;
            },
            close() {
                state.isOpen = false;
                state.resModel = null;
                state.resId = null;
                state.context = {};
                state.viewId = false;
            },

            closeActive() {
                state.activePanel = null;
            },

            closePinned() {
                if (state.activePanel) {
                    state.pinnedPanel = {
                        ...state.activePanel,
                        isCollapsed: false,
                    };
                    state.activePanel = null;
                } else {
                    state.pinnedPanel = null;
                }
            },

            toggleFolded() {
                console.log(state.isFolded + " => " + !state.isFolded);
                state.isFolded = !state.isFolded;
            },

            togglePinned() {
                console.log(state.isPinned + " => " + !state.isPinned);
                state.isPinned = !state.isPinned;
            },

            get state() {
                return state;
            },
        };
    },
};

registry.category("services").add("sidepanel", sidePanelService);