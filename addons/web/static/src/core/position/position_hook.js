import { computePosition } from "@web/core/position/utils";
import { useThrottleForAnimation } from "@web/core/utils/timing";
import {
    EventBus,
    onWillDestroy,
    reactive,
    useChildSubEnv,
    useComponent,
    useEffect,
} from "@odoo/owl";
import { effect } from "../utils/reactive";

/**
 * @typedef {import("@web/core/position/utils").ComputePositionOptions} ComputePositionOptions
 * @typedef {import("@web/core/position/utils").PositioningSolution} PositioningSolution
 *
 * @typedef {Object} UsePositionOptionsExtensionType
 * @property {(popperElement: HTMLElement, solution: PositioningSolution) => void} [onPositioned]
 *  callback called when the positioning is done.
 * @typedef {ComputePositionOptions & UsePositionOptionsExtensionType} UsePositionOptions
 *
 * @typedef PositioningControl
 * @property {() => void} lock prevents further positioning updates
 * @property {() => void} unlock allows further positioning updates (triggers an update right away)
 */

const POSITION_BUS = Symbol("position-bus");

/**
 * Makes sure that the `popper` element is always
 * placed at `position` from the `target` element.
 * If doing so the `popper` element is clipped off `container`,
 * sensible fallback positions are tried.
 * If all of fallback positions are also clipped off `container`,
 * the original position is used.
 *
 * Note: The popper element should be indicated in your template
 *       with a t-ref reference matching the refName argument.
 *
 * @param {string} refName
 *  name of the reference to the popper element in the template.
 * @param {() => HTMLElement} getTarget
 * @param {UsePositionOptions} [options={}] the options to be used for positioning
 * @returns {PositioningControl}
 *  control object to lock/unlock the positioning.
 */
export function usePosition(popperRef, targetRef, options = {}) {
    const position = reactive({ x: 0, y: 0, popperStyles: {} });
    let lock = false;
    const update = () => {
        if (!popperRef.el || !targetRef.el?.isConnected || lock) {
            // No compute needed
            return;
        }

        // Reset popper style
        popperRef.el.style.position = "fixed";

        // Compute positioning solution
        const solution = computePosition(popperRef.el, targetRef.el, options);
        options.position = `${solution.direction}-${solution.variant}`; // memorize last position

        // Apply it
        popperRef.el.style.position = "fixed";
        popperRef.el.style.left = `${solution.left}px`;
        popperRef.el.style.top = `${solution.top}px`;

        // Update reactive
        if (solution.left !== position.x || solution.top !== position.y) {
            Object.assign(position, {
                solution,
                // middlewareData: solution.middlewareData,
                x: solution.left,
                y: solution.top,
                popperStyles: {
                    ...position.popperStyles,
                    position: "fixed",
                    left: `${solution.left}px`,
                    top: `${solution.top}px`,
                },
            });
        }
    };

    const component = useComponent();
    const bus = component.env[POSITION_BUS] || new EventBus();

    let executingUpdate = false;
    const batchedUpdate = async () => {
        // not same as batch, here we're executing once and then awaiting
        if (!executingUpdate) {
            executingUpdate = true;
            update();
            await Promise.resolve();
            executingUpdate = false;
        }
    };
    bus.addEventListener("update", batchedUpdate);
    onWillDestroy(() => bus.removeEventListener("update", batchedUpdate));

    const isTopmost = !(POSITION_BUS in component.env);
    if (isTopmost) {
        useChildSubEnv({ [POSITION_BUS]: bus });
    }

    const throttledUpdate = useThrottleForAnimation(() => bus.trigger("update"));
    useEffect(() => {
        // Reposition
        bus.trigger("update");

        if (isTopmost) {
            // Attach listeners to keep the positioning up to date
            const scrollListener = (e) => {
                if (popperRef.el?.contains(e.target)) {
                    // In case the scroll event occurs inside the popper, do not reposition
                    return;
                }
                throttledUpdate();
            };
            const targetDocument = targetRef.el?.ownerDocument;
            targetDocument?.addEventListener("scroll", scrollListener, { capture: true });
            targetDocument?.addEventListener("load", throttledUpdate, { capture: true });
            window.addEventListener("resize", throttledUpdate);
            return () => {
                targetDocument?.removeEventListener("scroll", scrollListener, { capture: true });
                targetDocument?.removeEventListener("load", throttledUpdate, { capture: true });
                window.removeEventListener("resize", throttledUpdate);
            };
        }
    });

    effect(
        ({ x, y }) => {
            if (!popperRef.el) {
                return;
            }
            popperRef.el.style.position = "fixed";
            popperRef.el.style.left = `${x}px`;
            popperRef.el.style.top = `${y}px`;
        },
        [position]
    );

    return {
        position,
        lock: () => {
            lock = true;
        },
        unlock: () => {
            lock = false;
            bus.trigger("update");
        },
    };
}
