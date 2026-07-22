import { Component, markup, whenReady, validate } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { registry } from "@web/core/registry";
import { session } from "@web/session";
import { loadBundle } from "@web/core/assets";
import { createPointerState } from "@web_tour/js/tour_pointer/tour_pointer_state";
import { tourState } from "@web_tour/js/tour_state";
import { callWithUnloadCheck } from "@web_tour/js/utils/tour_utils";
import {
    tourRecorderState,
    TOUR_RECORDER_ACTIVE_LOCAL_STORAGE_KEY,
} from "@web_tour/js/tour_recorder/tour_recorder_state";
import { redirect } from "@web/core/utils/urls";
import { rpc } from "@web/core/network/rpc";

class OnboardingItem extends Component {
    static components = { DropdownItem };
    static template = "web_tour.OnboardingItem";
    static props = {
        toursEnabled: { type: Boolean },
        toggleItem: { type: Function },
    };
    setup() {}
}

const StepSchema = {
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
    highlight: { type: String, optional: true },
    highlightColor: { type: String, optional: true },
    //ONLY IN DEBUG MODE
    pause: { type: Boolean, optional: true },
    break: { type: Boolean, optional: true },
};

const TourSchema = {
    name: { type: String, optional: true },
    steps: Function,
    url: { type: String, optional: true },
    wait_for: { type: [Function, Object], optional: true },
};

registry.category("web_tour.tours").addValidation(TourSchema);
const debugMenuRegistry = registry.category("debug").category("default");

export const tourService = {
    // localization dependency to make sure translations used by tours are loaded
    dependencies: ["orm", "effect", "overlay", "localization", "notification"],
    start: async (env, { orm, effect, overlay, notification }) => {
        await whenReady();
        let toursEnabled = session?.tour_enabled;
        const tourRegistry = registry.category("web_tour.tours");
        const pointer = createPointerState();
        pointer.stop = () => {};

        debugMenuRegistry.add("onboardingItem", () => ({
            type: "component",
            Component: OnboardingItem,
            props: {
                toursEnabled: toursEnabled || false,
                toggleItem: async () => {
                    tourState.clear();
                    toursEnabled = await orm.call("res.users", "switch_tour_enabled", [
                        !toursEnabled,
                    ]);
                    browser.location.reload();
                },
            },
            sequence: 500,
            section: "testing",
        }));

        function getTourFromRegistry(tourName) {
            if (!tourRegistry.contains(tourName)) {
                return;
            }
            const tour = tourRegistry.get(tourName);
            return {
                ...tour,
                steps: tour.steps(),
                name: tourName,
                wait_for: tour.wait_for || Promise.resolve(),
            };
        }

        async function getTourFromDB(tourName) {
            const tour = await orm.call("web_tour.tour", "get_tour_json_by_name", [tourName]);
            if (!tour) {
                throw new Error(`Tour '${tourName}' is not found in the database.`);
            }

            if (!tour.steps.length && tourRegistry.contains(tour.name)) {
                tour.steps = tourRegistry.get(tour.name).steps();
            }

            return tour;
        }

        function validateStep(step) {
            try {
                validate(step, StepSchema);
            } catch (error) {
                console.error(
                    `Error in schema for TourStep ${JSON.stringify(step, null, 4)}\n${
                        error.message
                    }`
                );
            }
        }

        async function startTour(tourName, options = {}) {
            pointer.stop();
            const tourFromRegistry = getTourFromRegistry(tourName);

            if (!tourFromRegistry && !options.fromDB) {
                // Sometime tours are not loaded depending on the modules.
                // For example, point_of_sale do not load all tours assets.
                return;
            }

            const tour = options.fromDB ? { name: tourName, url: options.url } : tourFromRegistry;
            if (!session.is_public && !toursEnabled && options.mode === "manual") {
                toursEnabled = await orm.call("res.users", "switch_tour_enabled", [!toursEnabled]);
            }

            let tourConfig = {
                delayToCheckUndeterminisms: 0,
                stepDelay: 2000,
                keepWatchBrowser: false,
                mode: "auto",
                showPointerDuration: 0,
                debug: false,
                redirect: true,
            };

            tourConfig = Object.assign(tourConfig, options);
            tourState.setCurrentConfig(tourConfig);
            tourState.setCurrentTour(tour.name);
            tourState.setCurrentIndex(0);

            const willUnload = callWithUnloadCheck(() => {
                if (tour.url && tourConfig.startUrl != tour.url && tourConfig.redirect) {
                    redirect(tour.url);
                }
            });
            if (!willUnload) {
                await resumeTour();
            }
        }

        async function resumeTour() {
            const tourName = tourState.getCurrentTour();
            const tourConfig = tourState.getCurrentConfig();

            let tour = getTourFromRegistry(tourName);
            if (tourConfig.fromDB) {
                tour = await getTourFromDB(tourName);
            }
            // if (!tour) {
            if (!tour || !tour.steps.length) {
                return;
            }

            tour.steps.forEach((step) => validateStep(step));

            if (tourConfig.mode === "auto") {
                if (!odoo.loader.modules.get("@web_tour/js/tour_automatic/tour_automatic")) {
                    await loadBundle("web_tour.automatic", { css: false });
                }
                await loadBundle("web_tour.interactive");
                const { TourPointer } = odoo.loader.modules.get(
                    "@web_tour/js/tour_pointer/tour_pointer"
                );
                pointer.stop = overlay.add(
                    TourPointer,
                    {
                        pointerState: pointer.state,
                        bounce: false,
                    },
                    {
                        sequence: 1100, // sequence based on bootstrap z-index values.
                    }
                );
                const { TourAutomatic } = odoo.loader.modules.get(
                    "@web_tour/js/tour_automatic/tour_automatic"
                );
                new TourAutomatic(tour).start(pointer);
            } else {
                await loadBundle("web_tour.interactive");
                const { TourPointer } = odoo.loader.modules.get(
                    "@web_tour/js/tour_pointer/tour_pointer"
                );
                pointer.stop = overlay.add(
                    TourPointer,
                    {
                        pointerState: pointer.state,
                        bounce: !(tourConfig.mode === "auto" && tourConfig.keepWatchBrowser),
                    },
                    {
                        sequence: 1100, // sequence based on bootstrap z-index values.
                    }
                );
                const { TourInteractive } = odoo.loader.modules.get(
                    "@web_tour/js/tour_interactive/tour_interactive"
                );
                new TourInteractive(tour).start(env, pointer, async () => {
                    pointer.stop();
                    tourState.clear();
                    browser.console.log("tour succeeded");
                    let message = tourConfig.rainbowManMessage || tour.rainbowManMessage;
                    if (message) {
                        message = window.DOMPurify.sanitize(tourConfig.rainbowManMessage);
                        effect.add({
                            type: "rainbow_man",
                            message: markup(message),
                        });
                    }

                    const nextTour = await orm.call("web_tour.tour", "consume", [tour.name]);
                    if (nextTour) {
                        startTour(nextTour.name, {
                            mode: "manual",
                            redirect: false,
                            rainbowManMessage: nextTour.rainbowManMessage,
                        });
                    }
                });
            }
        }

        async function tourRecorder() {
            await loadBundle("web_tour.recorder");
            const { TourRecorder } = odoo.loader.modules.get(
                "@web_tour/js/tour_recorder/tour_recorder"
            );
            const remove = overlay.add(
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
        }

        async function startTourRecorder() {
            if (!browser.localStorage.getItem(TOUR_RECORDER_ACTIVE_LOCAL_STORAGE_KEY)) {
                await tourRecorder();
            }
            browser.localStorage.setItem(TOUR_RECORDER_ACTIVE_LOCAL_STORAGE_KEY, "1");
        }

        if (!window.frameElement) {
            const paramsTourName = new URLSearchParams(browser.location.search).get("tour");
            if (paramsTourName) {
                startTour(paramsTourName, { mode: "manual", fromDB: true });
            }

            if (tourState.getCurrentTour()) {
                if (tourState.getCurrentConfig().mode === "auto" || toursEnabled) {
                    resumeTour();
                } else {
                    tourState.clear();
                }
            } else if (session.current_tour) {
                startTour(session.current_tour.name, {
                    mode: "manual",
                    redirect: false,
                    rainbowManMessage: session.current_tour.rainbowManMessage,
                });
            }

            if (
                browser.localStorage.getItem(TOUR_RECORDER_ACTIVE_LOCAL_STORAGE_KEY) &&
                !session.is_public
            ) {
                await tourRecorder();
            }
        }

        const RECORD_APPROACH = 2; // 1 = Controller + base64, 2 = Model + Attachment URL

        async function recordTourVideo(tourName) {
            const closeNotification = notification.add(
                "Tour recording has started on the server. Please wait...",
                { title: "Video Recorder", type: "info", sticky: true }
            );
            try {
                if (RECORD_APPROACH === 1) {
                    const result = await rpc("/web_tour/record_tour", { tour_name: tourName });
                    closeNotification();
                    if (result && result.success && result.video_data) {
                        // Convert base64 back to binary data
                        const binaryString = atob(result.video_data);
                        const len = binaryString.length;
                        const bytes = new Uint8Array(len);
                        for (let i = 0; i < len; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        const blob = new Blob([bytes], { type: "video/mp4" });
                        const url = URL.createObjectURL(blob);
                        
                        const a = document.createElement("a");
                        a.style.display = "none";
                        a.href = url;
                        a.download = `tour_recording_${tourName}_${Date.now()}.mp4`;
                        document.body.appendChild(a);
                        a.click();
                        
                        setTimeout(() => {
                            document.body.removeChild(a);
                            window.URL.revokeObjectURL(url);
                        }, 100);
                        
                        notification.add("Video recording successfully compiled and downloaded!", {
                            title: "Video Recorder",
                            type: "success",
                        });
                    } else {
                        const msg = (result && result.message) || "Unknown error";
                        notification.add(`Recording failed: ${msg}`, {
                            title: "Video Recorder",
                            type: "danger",
                            sticky: true
                        });
                    }
                } else {
                    const result = await orm.call("web_tour.recorder", "record_tour", [tourName]);
                    closeNotification();
                    if (result && result.success && result.attachment_id) {
                        notification.add("Video recording successfully saved to Attachments!", {
                            title: "Video Recorder",
                            type: "success",
                        });
                    } else {
                        const msg = (result && result.message) || "Unknown error";
                        notification.add(`Recording failed: ${msg}`, {
                            title: "Video Recorder",
                            type: "danger",
                            sticky: true
                        });
                    }
                }
            } catch (err) {
                closeNotification();
                console.error("Recording error:", err);
                notification.add(`Recording error: ${err.message || err}`, {
                    title: "Video Recorder",
                    type: "danger",
                    sticky: true
                });
            }
        }

        odoo.startTour = startTour;
        odoo.isTourReady = (tourName) => getTourFromRegistry(tourName).wait_for.then(() => true);

        return {
            startTour,
            startTourRecorder,
            recordTourVideo,
        };
    },
};

registry.category("services").add("tour_service", tourService);
