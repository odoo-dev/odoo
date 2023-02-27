/** @odoo-module **/

import { markup, whenReady, reactive } from "@odoo/owl";
import { isMobileOS } from "@web/core/browser/feature_detection";
import { _t } from "@web/core/l10n/translation";
import { MacroEngine } from "@web/core/macro";
import { registry } from "@web/core/registry";
import { config as transitionConfig } from "@web/core/transition";
import { session } from "@web/session";
import { TourPointer } from "../tour_pointer/tour_pointer";
import { TourPointerContainer } from "./tour_pointer_container";
import { compileStepAuto, compileStepManual, compileTourToMacro } from "./tour_compilers";
import { createPointerState } from "./tour_pointer_state";
import { tourState } from "./tour_state";
import { callWithUnloadCheck } from "./tour_utils";

/**
 * @typedef {string} JQuerySelector
 * @typedef {import("./tour_utils").RunCommand} RunCommand
 *
 * @typedef Tour
 * @property {string} url
 * @property {TourStep[]} steps
 * @property {boolean} [rainbowMan]
 * @property {number} [sequence]
 * @property {boolean} [test]
 * @property {Promise<any>} [wait_for]
 * @property {string} [saveAs]
 * @property {string} [fadeout]
 * @property {number} [checkDelay]
 *
 * @typedef TourStep
 * @property {string} [id]
 * @property {JQuerySelector} trigger
 * @property {JQuerySelector} [extra_trigger]
 * @property {JQuerySelector} [alt_trigger]
 * @property {JQuerySelector} [skip_trigger]
 * @property {string} [content]
 * @property {"top" | "botton" | "left" | "right"} [position]
 * @property {"community" | "enterprise"} [edition]
 * @property {RunCommand} [run]
 * @property {boolean} [auto]
 * @property {boolean} [in_modal]
 * @property {number} [width]
 * @property {number} [timeout]
 * @property {boolean} [consumeVisibleOnly]
 * @property {boolean} [noPrepend]
 * @property {string} [consumeEvent]
 * @property {boolean} [mobile]
 * @property {string} [title]
 *
 * @typedef {"manual" | "auto"} TourMode
 */

/** @type {() => { [k: string]: Tour }} */
function extractRegisteredTours() {
    const tours = {};
    for (const [name, tour] of registry.category("web_tour.tours").getEntries()) {
        tours[name] = {
            name: tour.saveAs || name,
            steps: tour.steps,
            url: tour.url,
            rainbowMan: tour.rainbowMan === undefined ? true : !!tour.rainbowMan,
            rainbowManMessage: tour.rainbowManMessage,
            fadeout: tour.fadeout || "medium",
            sequence: tour.sequence || 1000,
            test: tour.test,
            wait_for: tour.wait_for || Promise.resolve(),
            checkDelay: tour.checkDelay,
        };
    }
    return tours;
}

/**
 * @param {TourStep} step
 * @param {TourMode} mode
 */
function shouldOmit(step, mode) {
    const isDefined = (key, obj) => key in obj && obj[key] !== undefined;
    const getEdition = () =>
        session.server_version_info.slice(-1)[0] === "e" ? "enterprise" : "community";
    const correctEdition = isDefined("edition", step) ? step.edition === getEdition() : true;
    const correctDevice = isDefined("mobile", step) ? step.mobile === isMobileOS() : true;
    return (
        !correctEdition ||
        !correctDevice ||
        // `step.auto = true` means omitting a step in a manual tour.
        (mode === "manual" && step.auto)
    );
}

export const tourService = {
    dependencies: ["orm", "effect"],
    start: async (_env, { orm, effect }) => {
        await whenReady();

        const tours = extractRegisteredTours();
        const macroEngine = new MacroEngine({ target: document });
        const consumedTours = new Set(session.web_tours);

        const pointers = reactive({});
        let pointerId = 0;

        registry.category("main_components").add("TourPointerContainer", {
            Component: TourPointerContainer,
            props: { pointers },
        });

        function createPointer(config) {
            const id = pointerId++;
            const { state: pointerState, methods } = createPointerState();
            return {
                start() {
                    pointers[id] = {
                        id,
                        component: TourPointer,
                        props: { pointerState, ...config },
                    };
                },
                stop() {
                    delete pointers[id];
                    methods.destroy();
                },
                ...methods,
            };
        }

        /**
         * @param {Tour} tour
         * @param {ReturnType<typeof createPointer>} pointer
         * @param {{ mode: TourMode, stepDelay: number, watch: boolean}} options
         */
        function convertToMacro(tour, pointer, { mode, stepDelay, watch }) {
            // IMPROVEMENTS: Custom step compiler. Will probably require decoupling from `mode`.
            const stepCompiler = mode === "auto" ? compileStepAuto : compileStepManual;
            const checkDelay = mode === "auto" ? tour.checkDelay : 100;
            const filteredSteps = tour.steps.filter((step) => !shouldOmit(step, mode));
            return compileTourToMacro(tour, {
                filteredSteps,
                stepCompiler,
                pointer,
                stepDelay,
                watch,
                checkDelay,
                onTourEnd({ name, rainbowManMessage, fadeout }) {
                    if (mode === "auto") {
                        transitionConfig.disabled = false;
                    }
                    let message;
                    if (typeof rainbowManMessage === "function") {
                        message = rainbowManMessage({
                            isTourConsumed: (name) => consumedTours.has(name),
                        });
                    } else if (typeof rainbowManMessage === "string") {
                        message = rainbowManMessage;
                    } else {
                        message = markup(
                            _t(
                                "<strong><b>Good job!</b> You went through all steps of this tour.</strong>"
                            )
                        );
                    }
                    effect.add({ type: "rainbow_man", message, fadeout });
                    if (mode === "manual") {
                        consumedTours.add(name);
                        orm.call("web_tour.tour", "consume", [[name]]);
                    }
                    pointer.stop();
                    // Used to signal the python test runner that the tour finished without error.
                    console.log("test successful");
                },
            });
        }

        /**
         * Disable transition before starting an "auto" tour.
         * @param {Macro} macro
         * @param {'auto' | 'manual'} mode
         */
        function activateMacro(macro, mode) {
            if (mode === "auto") {
                transitionConfig.disabled = true;
            }
            macroEngine.activate(macro);
        }

        function startTour(tourName, options = {}) {
            options = Object.assign({ stepDelay: 0, watch: false, mode: "auto", url: "" }, options);
            const tour = tours[tourName];
            if (!tour) {
                throw new Error(`Tour '${tourName}' is not found.`);
            }
            tourState.set(tourName, "currentIndex", 0);
            tourState.set(tourName, "stepDelay", options.stepDelay);
            tourState.set(tourName, "watch", options.watch);
            tourState.set(tourName, "mode", options.mode);
            const pointer = createPointer({ bounce: !(options.mode === "auto" && options.watch) });
            const macro = convertToMacro(tour, pointer, options);
            const willUnload = callWithUnloadCheck(() => {
                if (tour.url && tour.url !== options.url) {
                    window.location.href = window.location.origin + tour.url;
                }
            });
            if (!willUnload) {
                pointer.start();
                activateMacro(macro, options.mode);
            }
        }

        function resumeTour(tourName) {
            const tour = tours[tourName];
            const stepDelay = tourState.get(tourName, "stepDelay");
            const watch = tourState.get(tourName, "watch");
            const mode = tourState.get(tourName, "mode");
            const pointer = createPointer({ bounce: !(mode === "auto" && watch) });
            const macro = convertToMacro(tour, pointer, { stepDelay, watch, mode });
            pointer.start();
            activateMacro(macro, mode);
        }

        if (!window.frameElement) {
            // Resume running tours.
            for (const tourName of tourState.getActiveTourNames()) {
                if (tourName in tours) {
                    resumeTour(tourName);
                } else {
                    // If a tour found in the local storage is not found in the `tours` map,
                    // then it is an outdated tour state. It should be cleared.
                    tourState.clear(tourName);
                }
            }
        }

        odoo.startTour = startTour;
        odoo.isTourReady = (tourName) => tours[tourName].wait_for.then(() => true);

        return {
            startTour,
            getSortedTours() {
                return Object.values(tours).sort((t1, t2) => {
                    return t1.sequence - t2.sequence || (t1.name < t2.name ? -1 : 1);
                });
            },
        };
    },
};

registry.category("services").add("tour_service", tourService);
