/** @odoo-module **/

import { getScrollPosition, setScrollPosition } from "../../core/utils/scrolling";
import { useEffect } from "../../core/effect_hook";
import { useBus } from "../../core/bus_hook";

const { useComponent, useEnv } = owl.hooks;

// -----------------------------------------------------------------------------
// Action hook
// -----------------------------------------------------------------------------
const scrollSymbol = Symbol("scroll");

/**
 * This hooks should be used by Action Components (client actions or views). It
 * allows to implement the 'export' feature which aims at restoring the state
 * of the Component when we come back to it (e.g. using the breadcrumbs).
 */
export function useSetupAction({ beforeLeave, export: exportMethod }) {
    const component = useComponent();
    const env = useEnv();

    const { action, controller } = component.props;
    if (action.target !== "new") {
        controller.getState = () => {
            const state = {};
            state[scrollSymbol] = getScrollPosition(component);
            if (exportMethod) {
                Object.assign(state, exportMethod());
            }
            return state;
        };
        if (beforeLeave) {
            useBus(env.bus, "CLEAR-UNCOMMITTED-CHANGES", (callbacks) => {
                callbacks.push(beforeLeave);
            });
        }
    }
    useEffect(() => {
        if (component.props.state) {
            setScrollPosition(component, component.props.state[scrollSymbol]);
        }
    }, () => []);
}
