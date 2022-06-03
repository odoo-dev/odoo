/** @odoo-module **/

const { onMounted, useComponent, useEffect, useExternalListener } = owl;

const scrollSymbol = Symbol("scroll");

export class CallbackRecorder {
    constructor() {
        this.setup();
    }
    setup() {
        this._callbacks = [];
    }
    /**
     * @returns {Function[]}
     */
    get callbacks() {
        return this._callbacks.map(({ callback }) => callback);
    }
    /**
     * @param {any} owner
     * @param {Function} callback
     */
    add(owner, callback) {
        if (!callback) {
            throw new Error("Missing callback");
        }
        this._callbacks.push({ owner, callback });
    }
    /**
     * @param {any} owner
     */
    remove(owner) {
        this._callbacks = this._callbacks.filter((s) => s.owner !== owner);
    }
}

/**
 * @param {CallbackRecorder} callbackRecorder
 * @param {Function} callback
 */
export function useCallbackRecorder(callbackRecorder, callback) {
    const component = useComponent();
    useEffect(
        () => {
            callbackRecorder.add(component, callback);
            return () => callbackRecorder.remove(component);
        },
        () => []
    );
}

/**
 */
export function useSetupAction(params = {}) {
    const component = useComponent();
    const {
        __beforeLeave__,
        __getGlobalState__,
        __getLocalState__,
        __getContext__,
    } = component.env;

    const { beforeUnload, beforeLeave, getGlobalState, getLocalState, rootRef } = params;

    if (beforeUnload) {
        useExternalListener(window, "beforeunload", beforeUnload);
    }
    if (__beforeLeave__ && beforeLeave) {
        useCallbackRecorder(__beforeLeave__, beforeLeave);
    }
    if (__getGlobalState__ && (getGlobalState || rootRef)) {
        useCallbackRecorder(__getGlobalState__, () => {
            const state = {};
            if (getGlobalState) {
                Object.assign(state, getGlobalState());
            }
            if (rootRef) {
                const searchPanelEl = rootRef.el.querySelector(".o_content .o_search_panel");
                if (searchPanelEl) {
                    state[scrollSymbol] = {
                        searchPanel: {
                            left: searchPanelEl.scrollLeft,
                            top: searchPanelEl.scrollTop,
                        },
                    };
                }
            }
            return state;
        });

        if (rootRef) {
            onMounted(() => {
                const { globalState } = component.props;
                const scrolling = globalState && globalState[scrollSymbol];
                if (scrolling) {
                    const searchPanelEl = rootRef.el.querySelector(".o_content .o_search_panel");
                    if (searchPanelEl) {
                        searchPanelEl.scrollLeft = scrolling.searchPanel.left || 0;
                        searchPanelEl.scrollTop = scrolling.searchPanel.top || 0;
                    }
                }
            });
        }
    }
    if (__getLocalState__ && (getLocalState || rootRef)) {
        useCallbackRecorder(__getLocalState__, () => {
            const state = {};
            if (getLocalState) {
                Object.assign(state, getLocalState());
            }
            if (rootRef) {
                const contentEl = rootRef.el.querySelector(".o_content");
                if (contentEl) {
                    state[scrollSymbol] = {
                        content: { left: contentEl.scrollLeft, top: contentEl.scrollTop },
                    };
                }
            }
            return state;
        });

        if (rootRef) {
            onMounted(() => {
                const { state } = component.props;
                const scrolling = state && state[scrollSymbol];
                if (scrolling) {
                    const contentEl = rootRef.el.querySelector(".o_content");
                    if (contentEl) {
                        contentEl.scrollTop = scrolling.content.top || 0;
                        contentEl.scrollLeft = scrolling.content.left || 0;
                    }
                }
            });
        }
    }
    if (__getContext__ && params.getContext) {
        useCallbackRecorder(__getContext__, params.getContext);
    }
}
