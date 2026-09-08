import { Component, markup, whenReady, validate } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { registry } from "@web/core/registry";
import { session } from "@web/session";
import { loadBundle } from "@web/core/assets";
import { pointerState } from "@web_tour/js/tour_pointer/tour_pointer";
import { tourState } from "@web_tour/js/tour_state";
import {
    tourRecorderState,
    TOUR_RECORDER_ACTIVE_LOCAL_STORAGE_KEY,
} from "@web_tour/js/tour_recorder/tour_recorder_state";
import { redirect } from "@web/core/utils/urls";
import { _t } from "@web/core/l10n/translation";

class OnboardingItem extends Component {
    static components = { DropdownItem };
    static template = "web_tour.OnboardingItem";
    static props = {
        toursEnabled: { type: Boolean },
        toggleItem: { type: Function },
    };
    setup() {}
}

const stepSchema = {
    id: { type: [String], optional: true },
    content: { type: [String, Object], optional: true }, //allow object(_t && markup)
    debugHelp: { type: String, optional: true },
    isActive: { type: Array, element: String, optional: true },
    run: { type: [String, Function, Boolean], optional: true },
    timeout: {
        optional: true,
        validate(value) {
            return value >= 0 && value <= 60000;
        },
    },
    tooltipPosition: {
        optional: true,
        validate(value) {
            return ["top", "bottom", "left", "right"].includes(value);
        },
    },
    trigger: { type: String },
    expectUnloadPage: { type: Boolean, optional: true },
    //ONLY IN DEBUG MODE
    pause: { type: Boolean, optional: true },
    break: { type: Boolean, optional: true },
};

const tourSchema = {
    name: { type: String, optional: true },
    steps: Function,
    url: { type: String, optional: true },
    wait_for: { type: [Function, Object], optional: true },
};

const tourRegistry = registry.category("web_tour.tours");
tourRegistry.addValidation(tourSchema);

export class TourService {
    /**
     * @param {import("@web/env").OdooEnv} env
     * @param {import("services").ServiceFactories} services
     */
    constructor(env, services) {
        this.env = env;
        this.orm = services["orm"];
        this.effect = services["effect"];
        this.overlay = services["overlay"];
        this.toursEnabled = session?.tour_enabled;
        this.removePointer = () => {};
        this.removeTourRecorder = () => {};
        this.addOnboardingItemInDebugMenu();

        if (window.frameElement) {
            return;
        }

        const paramsTourName = new URLSearchParams(browser.location.search).get("tour");
        if (paramsTourName) {
            this.startTour(paramsTourName, { mode: "manual", fromDB: true });
        }

        if (tourState.getCurrentTour()) {
            if (tourState.getCurrentConfig().mode === "auto" || this.toursEnabled) {
                this.resumeTour();
            } else {
                tourState.clear();
            }
        } else if (session.current_tour) {
            this.startTour(session.current_tour.name, {
                mode: "manual",
                redirect: false,
                rainbowManMessage: session.current_tour.rainbowManMessage,
            });
        }

        if (
            browser.localStorage.getItem(TOUR_RECORDER_ACTIVE_LOCAL_STORAGE_KEY) &&
            !session.is_public
        ) {
            this.addTourRecorderToOverlay();
        }
    }

    addOnboardingItemInDebugMenu() {
        const debugMenuRegistry = registry.category("debug").category("default");
        debugMenuRegistry.add("onboardingItem", () => ({
            type: "component",
            Component: OnboardingItem,
            props: {
                toursEnabled: this.toursEnabled || false,
                toggleItem: async () => {
                    tourState.clear();
                    this.toursEnabled = await this.orm.call("res.users", "switch_tour_enabled", [
                        !this.toursEnabled,
                    ]);
                    browser.location.reload();
                },
            },
            sequence: 500,
            section: "testing",
        }));
    }

    /**
     * Add tour recorder component in overlay container.
     */
    async addTourRecorderToOverlay() {
        if (!odoo.loader.modules.get("@web_tour/js/tour_recorder/tour_recorder")) {
            await loadBundle("web_tour.recorder");
        }
        const { TourRecorder } = odoo.loader.modules.get(
            "@web_tour/js/tour_recorder/tour_recorder"
        );
        const remove = this.overlay.add(
            TourRecorder,
            {
                onClose: () => {
                    remove();
                    browser.localStorage.removeItem(TOUR_RECORDER_ACTIVE_LOCAL_STORAGE_KEY);
                    tourRecorderState.clear();
                },
            },
            { sequence: 99999 }
        );

        this.removeTourRecorder = () => {
            remove();
            browser.localStorage.removeItem(TOUR_RECORDER_ACTIVE_LOCAL_STORAGE_KEY);
            tourRecorderState.clear();
        };
    }

    /**
     * @param {string} name The name of the tour
     */
    async getTour(name, options) {
        let tour = tourRegistry.get(name, null);
        if (options.mode === "manual" && options.fromDB) {
            tour = await this.orm.call("web_tour.tour", "get_tour_json_by_name", [name]);
            if (!tour) {
                throw new Error(`Tour '${name}' is not found in the database.`);
            }

            if (!tour.steps.length && tourRegistry.contains(tour.name)) {
                tour.steps = tourRegistry.get(tour.name).steps;
            }
        }
        if (!tour) {
            return undefined;
        }
        const url = options.fromDB ? options.url : tour.url;
        return {
            ...tour,
            name,
            url,
            steps:
                typeof tour.steps === "function"
                    ? tour.steps()
                    : Array.isArray(tour.steps)
                    ? tour.steps
                    : [],
            waitFor: tour.wait_for || Promise.resolve(),
        };
    }

    /**
     * Wait the tour is ready (only for automatic tour)
     * @param {string} name The name of the tour
     */
    async isTourReady(name) {
        if (!tourRegistry.contains(name)) {
            return false;
        }
        const tour = tourRegistry.get(name);
        await (tour.wait_for || Promise.resolve());
        return true;
    }

    async resumeTour() {
        const tourName = tourState.getCurrentTour();
        const tourConfig = tourState.getCurrentConfig();
        const tour = await this.getTour(tourName, tourConfig);
        if (!tour || !tour.steps.length) {
            return;
        }

        tour.steps.forEach((step) => this.validateStep(step));

        if (tourConfig.mode === "auto") {
            if (!odoo.loader.modules.get("@web_tour/js/tour_automatic/tour_automatic")) {
                await loadBundle("web_tour.automatic", { css: false });
            }
            const { TourAutomatic } = odoo.loader.modules.get(
                "@web_tour/js/tour_automatic/tour_automatic"
            );
            new TourAutomatic(tour).start();
        } else {
            await loadBundle("web_tour.interactive");
            const { TourPointer } = odoo.loader.modules.get(
                "@web_tour/js/tour_pointer/tour_pointer"
            );
            this.removePointer = this.overlay.add(
                TourPointer,
                {
                    pointerState,
                    bounce: !(tourConfig.mode === "auto" && tourConfig.keepWatchBrowser),
                },
                {
                    sequence: 1100, // sequence based on bootstrap z-index values.
                }
            );
            const { TourInteractive } = odoo.loader.modules.get(
                "@web_tour/js/tour_interactive/tour_interactive"
            );
            new TourInteractive(tour).start(this.env, async () => {
                this.removePointer();
                tourState.clear();
                browser.console.log("tour succeeded");
                let message = tourConfig.rainbowManMessage || tour.rainbowManMessage;
                if (message) {
                    message = window.DOMPurify.sanitize(tourConfig.rainbowManMessage);
                    this.effect.add({
                        type: "rainbow_man",
                        message: markup(message),
                    });
                }

                const nextTour = await this.orm.call("web_tour.tour", "consume", [tour.name]);
                if (nextTour) {
                    this.startTour(nextTour.name, {
                        mode: "manual",
                        redirect: false,
                        rainbowManMessage: nextTour.rainbowManMessage,
                    });
                }
            });
        }
    }

    /**
     * Starts manual or automatic tour.
     * This retrieves a tour from the internal registry or from the database
     * if `options.fromDB` is set.
     *
     * @param {string} name - The name of the tour to start.
     * @param {Object} [options={}] - Options to customize the tour start.
     * @param {boolean} [options.fromDB=false] - Whether the tour should be loaded from the database.
     * @param {string} [options.url] - URL to start the tour.
     * @param {"auto"|"manual"} [options.mode="auto"] - Tour start mode ("auto" or "manual").
     * @param {number} [options.delayToCheckUndeterminisms=0] - Delay to check for indeterminisms in steps.
     * @param {number} [options.stepDelay=0] - Delay between each tour step.
     * @param {boolean} [options.keepWatchBrowser=false] - Whether to keep watching the browser continuously.
     * @param {number} [options.showPointerDuration=0] - Duration to show the pointer on each step.
     * @param {boolean} [options.debug=false] - Enables debug mode for the tour.
     * @param {boolean} [options.redirect=true] - Whether to redirect to `tour.url` if necessary.
     */
    async startTour(name, options = {}) {
        this.removePointer();
        this.removeTourRecorder();
        const tour = await this.getTour(name, options);
        if (!tour) {
            return;
        }
        if (!session.is_public && !this.toursEnabled && options.mode === "manual") {
            this.toursEnabled = await this.orm.call("res.users", "switch_tour_enabled", [
                !this.toursEnabled,
            ]);
        }

        // HOOKS FOR DEBUGGING
        (() => {
            console.log("[DEBUG_OWL] Initializing non-interactive OWL overwrite monitor...");

            /**
             * Traverses window.__OWL_DEVTOOLS__ to locate the component instance
             * whose inputRef matches the target HTMLInputElement.
             */
            function findComponentByElement(targetEl) {
                if (!window.__OWL_DEVTOOLS__ || !window.__OWL_DEVTOOLS__.apps) {
                    console.error("[DEBUG_OWL] window.__OWL_DEVTOOLS__.apps is not available.");
                    return null;
                }

                const visited = new Set();

                function search(node) {
                    if (!node || typeof node !== "object" || visited.has(node)) return null;
                    visited.add(node);

                    // Extract component instance (whether node is a Fiber or Component)
                    const comp = node.component || node;

                    // Match target input element against inputRef or component refs
                    if (comp.inputRef?.el === targetEl || comp.inputRef?.current === targetEl || comp.el === targetEl) {
                        return comp;
                    }

                    // Check if any registered ref points to targetEl
                    for (const key in comp) {
                        try {
                            const prop = comp[key];
                            if (prop && typeof prop === "object" && (prop.el === targetEl || prop.current === targetEl)) {
                                return comp;
                            }
                        } catch (e) {}
                    }

                    // Collect child nodes from component / __owl__ / fiber structures
                    const children = [];
                    if (comp.children) {
                        if (Array.isArray(comp.children)) children.push(...comp.children);
                        else if (typeof comp.children === "object") children.push(...Object.values(comp.children));
                    }
                    if (comp.__owl__?.children) {
                        children.push(...Object.values(comp.__owl__.children));
                    }
                    if (node.children) {
                        if (Array.isArray(node.children)) children.push(...node.children);
                        else if (typeof node.children === "object") children.push(...Object.values(node.children));
                    }

                    for (const child of children) {
                        const match = search(child);
                        if (match) return match;
                    }

                    return null;
                }

                for (const app of window.__OWL_DEVTOOLS__.apps) {
                    if (app.root) {
                        const match = search(app.root);
                        if (match) return match;
                    }
                }

                return null;
            }

            // Helper to format DOM element selectors for log clarity
            function getSelector(el) {
                if (!el || el === window || el === document) return "window / document";
                if (el.nodeType !== 1) return el.nodeName;
                let selector = el.tagName.toLowerCase();
                if (el.id) selector += `#${el.id}`;
                if (el.className && typeof el.className === "string") {
                    selector += `.${el.className.trim().replace(/\s+/g, ".")}`;
                }
                return selector;
            }

            // Capture ALL native DOM scroll events (useCapture = true is required)
            window.addEventListener(
                "scroll",
                (event) => {
                    const target = event.target;
                    const now = performance.now().toFixed(2);
                    const targetName = getSelector(target);
                    const scrollTop = target === window || target === document ? window.scrollY : target.scrollTop;
                    const scrollLeft = target === window || target === document ? window.scrollX : target.scrollLeft;

                    console.warn(`[DEBUG_NATIVE_SCROLL_EVENT][${now}ms] Scroll fired on: <${targetName}>`);
                    console.log(`[DEBUG_SCROLL] Target Element:`, target);
                    console.log(`[DEBUG_SCROLL] Offsets -> scrollTop: ${scrollTop}, scrollLeft: ${scrollLeft}`);
                },
                true // CRITICAL: scroll events do not bubble, must use capture phase
            );

            // Intercept programmatic .scrollIntoView() calls (e.g. from Tour runner or OWL focus)
            const origScrollIntoView = Element.prototype.scrollIntoView;
            Element.prototype.scrollIntoView = function (...args) {
                const now = performance.now().toFixed(2);
                console.warn(`[DEBUG_PROGRAMMATIC_SCROLL][${now}ms] scrollIntoView() called on: <${getSelector(this)}>`);
                console.log(`[DEBUG_SCROLL] Target Element:`, this);
                console.log(`[DEBUG_SCROLL] Stack Trace:\n` + new Error().stack);
                return origScrollIntoView.apply(this, args);
            };

            // Intercept direct scrollTop assignments
            const origScrollTopSetter = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop").set;
            Object.defineProperty(Element.prototype, "scrollTop", {
                set: function (val) {
                    const prev = this.scrollTop;
                    if (prev !== val) {
                        const now = performance.now().toFixed(2);
                        console.warn(`[DEBUG_PROGRAMMATIC_SCROLL][${now}ms] scrollTop changed (${prev}px -> ${val}px) on: <${getSelector(this)}>`);
                        console.log(`[DEBUG_SCROLL] Target Element:`, this);
                        console.log(`[DEBUG_SCROLL] Stack Trace:\n` + new Error().stack);
                    }
                    return origScrollTopSetter.call(this, val);
                },
                configurable: true,
            });

            // Log WebFont loading and layout reflow triggers
            if (document.fonts) {
                document.fonts.addEventListener("loadingdone", (e) => {
                    const fonts = e.fontfaces.map((f) => f.family).join(", ");
                    console.log(`[DEBUG_OWL][${performance.now().toFixed(2)}ms] Font loaded/reflow: ${fonts}`);
                });
            }

            // Intercept native value setter on HTMLInputElement
            const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;

            Object.defineProperty(HTMLInputElement.prototype, "value", {
                set: function (val) {
                    const prevVal = this.value;
                    const isTargetInput = this.matches(".o-autocomplete input");

                    if (isTargetInput) {
                        // Check if the value was wiped back to empty
                        if (prevVal !== "" && val === "") {
                            console.warn(`[DEBUG_OWL_RESET_DETECTED][${performance.now().toFixed(2)}ms] Input wiped: "${prevVal}" -> "${val}"`);
                            console.log(`[DEBUG_OWL] Font status: ${document.fonts ? document.fonts.status : "N/A"}`);
                            console.log(`[DEBUG_OWL] Active element:`, document.activeElement);

                            // Retrieve component state via DevTools traversal
                            const comp = findComponentByElement(this);
                            if (comp) {
                                console.log(`[DEBUG_OWL] Component Name:`, comp.constructor.name);
                                console.log(`[DEBUG_OWL] Component Reactive State:`, JSON.parse(JSON.stringify(comp.state || {})));
                                console.log(`[DEBUG_OWL] Component Props:`, JSON.parse(JSON.stringify(comp.props || {})));
                            } else {
                                console.warn(`[DEBUG_OWL] Could not match target input to an OWL component instance via DevTools.`);
                            }

                            // Print call stack to identify if OWL patch() triggered this write
                            console.log("[DEBUG_OWL] Stack trace of reset:\n" + new Error().stack);
                        } else {
                            console.log(`[DEBUG_OWL][${performance.now().toFixed(2)}ms] Input updated: "${prevVal}" -> "${val}"`);
                            console.log("[DEBUG_OWL] Stack trace of update:\n" + new Error().stack);
                        }
                    }

                    return nativeValueSetter.call(this, val);
                },
                configurable: true,
            });

            // Observe if OWL completely replaces or destroys the input DOM node
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    for (const removedNode of mutation.removedNodes) {
                        if (removedNode.nodeType === 1) {
                            const wasInput = removedNode.matches?.(".o-autocomplete input") || 
                                            removedNode.querySelector?.(".o-autocomplete input");
                            if (wasInput) {
                                console.warn(`[DEBUG_OWL_NODE_REMOVED][${performance.now().toFixed(2)}ms] Target input DOM element detached by OWL patch!`);
                                console.log("[DEBUG_OWL] Detach stack trace:\n" + new Error().stack);
                            }
                        }
                    }
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            const startTime = performance.now();
            const getTime = () => (performance.now() - startTime).toFixed(2);

            const log = (category, details) => {
                console.warn(`[TIMELINE][${getTime()}ms][${category}]`, details);
            };

            // Style & Structure Mutations (Style / DOM changes)
            const mutationObserver = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    log("MUTATION", {
                        type: m.type,
                        target: m.target,
                        attr: m.attributeName,
                        added: m.addedNodes.length,
                        removed: m.removedNodes.length,
                    });
                }
            });
            mutationObserver.observe(document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["style", "class", "hidden"],
            });

            // Geometry & Resizes (Layout changes)
            const resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    log("RESIZE", {
                        target: entry.target,
                        width: entry.contentRect.width,
                        height: entry.contentRect.height,
                    });
                }
            });
            resizeObserver.observe(document.documentElement);
            resizeObserver.observe(document.body);
            const modal = document.querySelector(".modal-content");
            if (modal) {
                resizeObserver.observe(modal);
            }

            // Browser-detected Layout Shifts (PerformanceObserver)
            try {
                const perfObserver = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (entry.entryType === "layout-shift") {
                            log("LAYOUT_SHIFT", {
                                value: entry.value,
                                hadRecentInput: entry.hadRecentInput,
                                sources: entry.sources?.map((s) => ({
                                    node: s.node,
                                    previousRect: s.previousRect,
                                    currentRect: s.currentRect,
                                })),
                            });
                        }
                    }
                });
                perfObserver.observe({ type: "layout-shift", buffered: true });
            } catch (e) {
                /* Layout Instability API unsupported */
            }

            // Native Event Capture (Scroll, Focus, Selection)
            const trackedEvents = [
                "scroll",
                "scrollend",
                "focusin",
                "focusout",
                "selectionchange",
                "input",
                "keydown",
            ];
            for (const evtType of trackedEvents) {
                window.addEventListener(
                    evtType,
                    (e) => {
                        log(`EVENT:${evtType.toUpperCase()}`, {
                            target: e.target,
                            isTrusted: e.isTrusted,
                            scrollTop: document.scrollingElement?.scrollTop ?? 0,
                            scrollLeft: document.scrollingElement?.scrollLeft ?? 0,
                        });
                    },
                    { capture: true }
                );
            }

            // Paint / Composite Boundaries (rAF Ticks) - bad idea
            // let frame = 0;
            // function tick() {
            //     frame++;
            //     log("FRAME_RENDER", `rAF tick #${frame}`);
            //     requestAnimationFrame(tick);
            // }
            // requestAnimationFrame(tick);
        })();
        // END HOOKS FOR DEBUGGING

        const tourConfig = {
            delayToCheckUndeterminisms: 0,
            stepDelay: 0,
            keepWatchBrowser: false,
            mode: "auto",
            showPointerDuration: 0,
            debug: false,
            redirect: true,
            ...options,
        };

        tourState.setCurrentConfig(tourConfig);
        tourState.setCurrentTour(name);
        tourState.setCurrentIndex(0);

        if (tour.url && tourConfig.startUrl != tour.url && tourConfig.redirect) {
            redirect(tour.url);
        } else {
            await this.resumeTour();
        }
    }

    async startTourRecorder() {
        if (!browser.localStorage.getItem(TOUR_RECORDER_ACTIVE_LOCAL_STORAGE_KEY)) {
            await this.addTourRecorderToOverlay();
        }
        browser.localStorage.setItem(TOUR_RECORDER_ACTIVE_LOCAL_STORAGE_KEY, "1");
    }

    /**
     * Validate a step according to {@link stepSchema}.
     * @param {Object} step - The step object to validate.
     */
    validateStep(step) {
        try {
            validate(step, stepSchema);
        } catch (error) {
            console.error(
                `Error in schema for TourStep ${JSON.stringify(step, null, 4)}\n${error.message}`
            );
        }
    }
}

registry.category("services").add("tour_service", {
    // localization dependency to make sure translations used by tours are loaded
    dependencies: ["orm", "effect", "overlay", "localization"],
    async start(env, services) {
        await whenReady();
        const service = new TourService(env, services);
        odoo.startTour = service.startTour.bind(service);
        odoo.isTourReady = service.isTourReady.bind(service);
        return service;
    },
});

registry.category("command_provider").add("tour_recorder", {
    provide: (env, options) => {
        const result = [];
        if (options.searchValue.toLowerCase() === "record") {
            result.push({
                action() {
                    env.services["tour_service"].startTourRecorder();
                },
                name: _t("Enable the tour recorder"),
            });
        }
        return result;
    },
});
