/**
 * BottomSheet
 *
 * @class
 */
import { Component, useState, useRef, onMounted, useExternalListener } from "@odoo/owl";
import { useHotkey } from "@web/core/hotkeys/hotkey_hook";
import { useForwardRefToParent } from "@web/core/utils/hooks";
import { useThrottleForAnimation, useDebounced } from "@web/core/utils/timing";
import { compensateScrollbar } from "@web/core/utils/scrolling";
import { getViewportDimensions, useViewportChange } from "@web/core/utils/dvu";
import { clamp } from "@web/core/utils/numbers";

export class BottomSheet extends Component {
    static template = "web.BottomSheet";

    static defaultProps = {
        animation: true,
        arrow: true,
        class: "",
        closeOnClickAway: () => true,
        closeOnEscape: true,
        componentProps: {},
        fixedPosition: false,
        setActiveElement: false,

        // Unused Props but needed as to be the same as Popover
        position: null,
    };

    static props = {
        // Main props
        component: { type: Function },
        componentProps: { optional: true, type: Object },
        close: { type: Function },

        // Styling and semantical props
        animation: { optional: true, type: Boolean },
        arrow: { optional: true, type: Boolean },
        class: { optional: true },
        role: { optional: true, type: String },

        // Positioning props
        fixedPosition: { optional: true, type: Boolean },
        holdOnHover: { optional: true, type: Boolean },
        onPositioned: { optional: true, type: Function },

        // Control props
        closeOnClickAway: { optional: true, type: Function },
        closeOnEscape: { optional: true, type: Boolean },
        setActiveElement: { optional: true, type: Boolean },

        hasParent: { optional: true, type: Boolean },

        // Unused Pops but needed as to be the same as Popover
        target: { optional: true, type: "*" },
        position: { optional: true, type: "*" },

        // Technical props
        ref: { optional: true, type: Function },
        slots: { optional: true, type: Object },
    };

    setup() {
        this.maxHeightPercent = 90;

        this.state = useState({
            isPositionedReady: false, // Sheet is ready for display
            isDismissing: false, // Sheet is being dismissed
            isSnappingEnabled: false, // Scroll Snap behavior enabled
            progress: 0, // Visual progress (0-1)
        });

        // Measurements and configuration
        this.measurements = {
            viewportHeight: 0,
            naturalHeight: 0,
            maxHeight: 0,
            dismissThreshold: 0,
            contentRequiresScrolling: false,
        };

        // Popover Ref Requirement
        useForwardRefToParent("ref");

        // References
        this.containerRef = useRef("container");
        this.scrollRailRef = useRef("scrollRail");
        this.sheetRef = useRef("sheet");
        this.sheetBodyRef = useRef("ref");
        this.sheetHandleRef = useRef("sheetHandle");

        // Create throttled version for onScroll
        this.throttledOnScroll = useThrottleForAnimation(this.onScroll.bind(this));

        // Create debounced function to enable snapping
        this.enableSnapping = useDebounced(() => {
            this.state.isSnappingEnabled = true;
        }, 50);

        // Adapt dimensions when mobile virtual-keyboards or browsers bars toggle
        useViewportChange(() => {
            if (this.state.isPositionedReady && !this.state.isDismissing) {
                this.updateDimensions();
            }
        });

        // Handle "ESC" key press.
        useHotkey("escape", () => this.slideOut());

        // Handle mobile "back" gesture and "back" navigation button.
        // Push a history state when the BottomSheet opens, intercept the browser's
        // history events, prevents navigation by pushing another state and closes the sheet.
        window.history.pushState({ bottomSheet: true }, "");
        this.handlePopState = () => {
            if (this.state.isPositionedReady && !this.state.isDismissing) {
                window.history.pushState({ bottomSheet: true }, "");
                this.slideOut();
            }
        };
        useExternalListener(window, "popstate", this.handlePopState);

        onMounted(() => {
            this.initializeSheet();
            compensateScrollbar(this.scrollRailRef.el, true, true, "padding-right");
        });
    }

    /**
     * Main initialization method for the sheet
     * Sets up measurements, snap points, and event handlers
     */
    initializeSheet() {
        if (!this.containerRef.el || !this.scrollRailRef.el || !this.sheetRef.el) {
            return;
        }

        // Step 1: Take measurements
        this.measureDimensions();

        // Step 2: Apply Dimensions
        this.applyDimensions();

        // Step 3: Set initial position
        this.positionSheet();

        // Step 4: Setup event handlers after everything has been properly resized and positioned
        this.setupEventHandlers();

        // Step 5: Mark as ready
        this.state.isPositionedReady = true;

        // Wait for CSS animation to complete before enabling snap for normal sheets
        const animationDuration = this.getAnimationDuration("--BottomSheet-slideIn-duration");

        // Use setTimeout for the initial animation since it has a specific duration
        setTimeout(() => {
            //this.sheetHandleRef.el?.focus();
            this.state.isSnappingEnabled = true;
        }, animationDuration);
    }

    /**
     * Updates dimensions when viewport changes
     * Recalculates measurements and snap points while preserving extended state
     */
    updateDimensions() {
        // Temporarily disable snapping during update
        this.state.isSnappingEnabled = false;

        // Update measurements with new viewport dimensions
        this.measureDimensions();
        this.applyDimensions();

        // Determine new scroll position based on previous state
        const newScrollTop = 0;

        // Update scroll position
        //this.scrollRailRef.el.scrollTop = newScrollTop;

        // Re-enable snapping after a short delay
        // Cancel any existing call first
        this.enableSnapping.cancel();
        this.enableSnapping();

        // Update progress value
        this.updateProgressValue(newScrollTop);
    }

    /**
     * Takes measurements of viewport and sheet dimensions
     * Calculates natural height and other key measurements
     */
    measureDimensions() {
        const viewportHeight = getViewportDimensions().height;

        // Calculate heights based on percentages
        const maxHeightPx = (this.maxHeightPercent / 100) * viewportHeight;

        // Reset any previously set constraints to measure natural height
        const sheet = this.sheetRef.el;
        sheet.style.removeProperty("min-height");
        sheet.style.removeProperty("height");
        sheet.style.maxHeight = "none";

        const naturalHeight = sheet.offsetHeight;
        const initialHeightPx = Math.min(naturalHeight, maxHeightPx);

        // Store all measurements
        this.measurements = {
            viewportHeight,
            naturalHeight,
            initialHeight: initialHeightPx,
            maxHeight: maxHeightPx,
            dismissThreshold: Math.min(initialHeightPx * 0.3, 100),
            contentRequiresScrolling: naturalHeight > maxHeightPx,
        };
    }

    /**
     * Applies calculated dimensions to the DOM elements
     * Sets CSS variables and styles based on measurements and snap points
     */
    applyDimensions() {
        const rail = this.scrollRailRef.el;
        // const sheet = this.sheetRef.el;

        // Convert heights to dvh percentages for CSS variables
        const heightPercent = Math.min(
            (this.measurements.initialHeight / this.measurements.viewportHeight) * 100,
            this.maxHeightPercent
        );
        const maxHeightPercent = this.maxHeightPercent;

        // Set CSS variables for heights
        rail.style.setProperty("--sheet-height", `${heightPercent}dvh`);
        rail.style.setProperty("--sheet-max-height", `${maxHeightPercent}dvh`);
        rail.style.setProperty("--dismiss-height", `${this.measurements.initialHeight || 0}px`);

        // Reset max-height to appropriate value
        // sheet.style.maxHeight = `${maxHeightPercent}dvh`;
    }

    /**
     * Sets the initial position of the sheet
     * Configures initial scroll position and overflow behavior
     */
    positionSheet() {
        const scrollRail = this.scrollRailRef.el;
        const bodyContent = this.sheetBodyRef.el;

        const scrollValue = this.measurements.maxHeight;

        // Configure body content overflow
        if (bodyContent) {
            bodyContent.style.overflowY = "auto";
        }

        // Set scroll position
        scrollRail.scrollTop = scrollValue || 0;
        scrollRail.style.containerType = "scroll-state size";
    }

    /**
     * Sets up event handlers for scroll and touch events
     */
    setupEventHandlers() {
        const scrollRail = this.scrollRailRef.el;

        // Add scroll event listener
        scrollRail.addEventListener("scroll", this.throttledOnScroll);
    }

    /**
     * Handles scroll events on the rail element
     * Updates progress, handles position snapping, and triggers dismissal
     */
    onScroll() {
        if (!this.scrollRailRef.el) {
            return;
        }

        const scrollTop = this.scrollRailRef.el.scrollTop;

        // Update progress value for visual effects
        this.updateProgressValue(scrollTop);

        // Check for dismissal condition
        if (scrollTop < this.measurements.dismissThreshold) {
            this.slideOut();
        }
    }

    /**
     * Calculates and updates the progress value based on scroll position
     *
     * @param {number} scrollTop - Current scroll position
     */
    updateProgressValue(scrollTop) {
        const initialPosition = this.measurements.naturalHeight;
        const progress = clamp(scrollTop / initialPosition, 0, 1);

        if (Math.abs(this.state.progress - progress) > 0.01) {
            this.state.progress = progress;
        }
    }

    /**
     * Initiates the slide out animation and dismissal
     */
    slideOut() {
        // Prevent duplicate calls
        if (this.state.isDismissing) {
            return;
        }

        // Update state to trigger animation
        this.state.isDismissing = true;
        this.state.isSnappingEnabled = false;

        // Cancel any pending snapping operations
        this.enableSnapping.cancel();

        // Get animation duration for the current sheet
        const animationDuration = this.getAnimationDuration("--BottomSheet-slideOut-duration");

        // Wait for animation to complete
        setTimeout(() => {
            if (this.props.close) {
                this.props.close();
            }
        }, animationDuration);
    }

    /**
     * Gets animation duration from CSS variable
     *
     * @param {string} property - CSS variable name
     * @returns {number} - Duration in milliseconds
     */
    getAnimationDuration(property) {
        if (!this.containerRef.el) {
            return 450;
        }

        const durationStr = getComputedStyle(this.containerRef.el)
            .getPropertyValue(property)
            .trim();

        if (!durationStr) {
            return 450;
        }

        if (durationStr.endsWith("ms")) {
            return parseFloat(durationStr) + 50;
        } else if (durationStr.endsWith("s")) {
            return parseFloat(durationStr) * 1000 + 50;
        }

        return parseFloat(durationStr) || 450;
    }

    /**
     * Closes the sheet (public API)
     */
    close() {
        this.slideOut();
    }

    /**
     * Handles back button press (public API)
     */
    back() {
        if (this.props.onBack) {
            this.props.onBack();
        } else {
            this.slideOut();
        }
    }
}
