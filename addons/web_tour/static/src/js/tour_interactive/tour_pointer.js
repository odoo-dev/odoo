import { Component, useEffect, useRef, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { browser } from "@web/core/browser/browser";
import { usePosition } from "@web/core/position/position_hook";
import { getScrollParent } from "../utils/tour_utils";
import { _t } from "@web/core/l10n/translation";

class Intersection {
    constructor() {
        /** @type {Element | null} */
        this.currentTarget = null;
        this.rootBounds = null;
        /** @type {IntersectionPosition} */
        this._targetPosition = "unknown";
        this._observer = new IntersectionObserver((observations) =>
            this._handleObservations(observations)
        );
    }

    /** @type {IntersectionObserverCallback} */
    _handleObservations(observations) {
        if (observations.length < 1) {
            return;
        }
        const observation = observations[observations.length - 1];
        this.rootBounds = observation.rootBounds;
        if (this.rootBounds && this.currentTarget) {
            if (observation.isIntersecting) {
                this._targetPosition = "in";
            } else {
                const scrollParentElement =
                    getScrollParent(this.currentTarget) || document.documentElement;
                const targetBounds = this.currentTarget.getBoundingClientRect();
                if (targetBounds.bottom > scrollParentElement.clientHeight) {
                    this._targetPosition = "out-below";
                } else if (targetBounds.top < 0) {
                    this._targetPosition = "out-above";
                } else if (targetBounds.left < 0) {
                    this._targetPosition = "out-left";
                } else if (targetBounds.right > scrollParentElement.clientWidth) {
                    this._targetPosition = "out-right";
                }
            }
        } else {
            this._targetPosition = "unknown";
        }
    }

    get targetPosition() {
        if (!this.rootBounds) {
            return this.currentTarget ? "in" : "unknown";
        } else {
            return this._targetPosition;
        }
    }

    /**
     * @param {Element} newTarget
     */
    setTarget(newTarget) {
        if (this.currentTarget !== newTarget) {
            if (this.currentTarget) {
                this._observer.unobserve(this.currentTarget);
            }
            if (newTarget) {
                this._observer.observe(newTarget);
            }
            this.currentTarget = newTarget;
        }
    }

    stop() {
        this._observer.disconnect();
    }
}

/**
 * @typedef {import("./tour_pointer_state").TourPointerState} TourPointerState
 *
 * @typedef TourPointerProps
 * @property {TourPointerState} pointerState
 * @property {boolean} bounce
 */

/** @extends {Component<TourPointerProps, any>} */
export class TourPointer extends Component {
    static instance = null;
    static template = "web_tour.TourPointer";
    static width = 28; // in pixels
    static height = 28; // in pixels

    setup() {
        TourPointer.instance = this;
        this.state = useState({
            isVisible: false,
            isOpen: false,
            bounce: this.props.bounce || true,
        });
        this.orm = useService("orm");
        const positionOptions = {
            margin: 6,
            onPositioned: (pointer, position) => {
                const popperRect = pointer.getBoundingClientRect();
                const { top, left, direction } = position;
                if (direction === "top") {
                    // position from the bottom instead of the top as it is needed
                    // to ensure the expand animation is properly done
                    pointer.style.bottom = `${window.innerHeight - top - popperRect.height}px`;
                    pointer.style.removeProperty("top");
                } else if (direction === "left") {
                    // position from the right instead of the left as it is needed
                    // to ensure the expand animation is properly done
                    pointer.style.right = `${window.innerWidth - left - popperRect.width}px`;
                    pointer.style.removeProperty("left");
                }
            },
        };
        Object.defineProperty(positionOptions, "position", {
            get: () => this.position,
            set: () => {}, // do not let the position hook change the position
            enumerable: true,
        });
        const position = usePosition("pointer", () => this.state.anchor, positionOptions);
        const rootRef = useRef("pointer");
        const zoneRef = useRef("zone");
        /** @type {DOMREct | null} */
        let dimensions = null;
        let lastMeasuredContent = null;
        let lastOpenState = this.isOpen;
        let lastAnchor;
        let [anchorX, anchorY] = [0, 0];
        useEffect(() => {
            const { el: pointer } = rootRef;
            const { el: zone } = zoneRef;
            if (pointer) {
                const hasContentChanged = lastMeasuredContent !== this.content;
                const hasOpenStateChanged = lastOpenState !== this.isOpen;
                lastOpenState = this.isOpen;

                // Check is the pointed element is a zone
                if (this.state.isZone) {
                    const { anchor } = this.state;
                    let offsetLeft = 0;
                    let offsetTop = 0;
                    if (document !== anchor.ownerDocument) {
                        const iframe = [...document.querySelectorAll("iframe")].filter(
                            (e) => e.contentDocument === anchor.ownerDocument
                        )[0];
                        offsetLeft = iframe.getBoundingClientRect().left;
                        offsetTop = iframe.getBoundingClientRect().top;
                    }
                    const { left, top, width, height } = anchor.getBoundingClientRect();
                    zone.style.minWidth = width + "px";
                    zone.style.minHeight = height + "px";
                    zone.style.left = left + offsetLeft + "px";
                    zone.style.top = top + offsetTop + "px";
                }

                // Content changed: we must re-measure the dimensions of the text.
                if (hasContentChanged) {
                    lastMeasuredContent = this.content;
                    pointer.style.removeProperty("width");
                    pointer.style.removeProperty("height");
                    dimensions = pointer.getBoundingClientRect();
                }

                // If the content or the "is open" state changed: we must apply
                // new width and height properties
                if (hasContentChanged || hasOpenStateChanged) {
                    const [width, height] = this.isOpen
                        ? [dimensions.width, dimensions.height]
                        : [this.constructor.width, this.constructor.height];
                    if (this.isOpen) {
                        pointer.style.removeProperty("transition");
                    } else {
                        // No transition if switching from open to closed
                        pointer.style.setProperty("transition", "none");
                    }
                    pointer.style.setProperty("width", `${width}px`);
                    pointer.style.setProperty("height", `${height}px`);
                }

                if (!this.isOpen) {
                    const { anchor } = this.state;
                    if (anchor === lastAnchor) {
                        const { x, y, width } = anchor.getBoundingClientRect();
                        const [lastAnchorX, lastAnchorY] = [anchorX, anchorY];
                        [anchorX, anchorY] = [x, y];
                        // Let's just say that the anchor is static if it moved less than 1px.
                        const delta = Math.sqrt(
                            Math.pow(x - lastAnchorX, 2) + Math.pow(y - lastAnchorY, 2)
                        );
                        if (delta < 1) {
                            position.lock();
                            return;
                        }
                        const wouldOverflow = window.innerWidth - x - width / 2 < dimensions?.width;
                        pointer.classList.toggle("o_expand_left", wouldOverflow);
                    }
                    lastAnchor = anchor;
                    pointer.style.bottom = "";
                    pointer.style.right = "";
                    position.unlock();
                }
            } else {
                lastMeasuredContent = null;
                lastOpenState = false;
                lastAnchor = null;
                dimensions = null;
            }
        });
    }

    get content() {
        return this.state.content || "";
    }

    get isOpen() {
        return this.state.isOpen && this.content;
    }

    get position() {
        return this.state.position || "top";
    }

    async onStopClicked() {
        await this.orm.call("res.users", "switch_tour_enabled", [false]);
        browser.location.reload();
    }

    static setState(newState) {
        if (!TourPointer.instance) {
            return;
        }
        Object.assign(TourPointer.instance.state, newState);
    }

    static hide() {
        TourPointer.setState({ content: "", isVisible: false, isOpen: false });
    }

    static showContent(isOpen) {
        TourPointer.setState({ isOpen });
    }

    /**
     * @param {TourStep} step
     * @param {HTMLElement} [anchor]
     * @param {boolean} [isZone] will border de zone. e.g.: a dropzone
     */
    static pointTo(anchor, step, isZone) {
        const intersection = new Intersection();
        intersection.setTarget(anchor);
        const floatingAnchor = document.createElement("div");
        floatingAnchor.className = "position-fixed";
        if (anchor) {
            let { tooltipPosition, content } = step;
            switch (intersection.targetPosition) {
                case "unknown": {
                    // Do nothing for unknown target position.
                    break;
                }
                case "in": {
                    if (document.body.contains(floatingAnchor)) {
                        floatingAnchor.remove();
                    }
                    TourPointer.setState({
                        anchor,
                        content,
                        isZone,
                        onClick: null,
                        position: tooltipPosition,
                        isVisible: true,
                    });
                    break;
                }
                default: {
                    const onClick = () => {
                        anchor.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        TourPointer.hide();
                    };

                    const scrollParent = getScrollParent(anchor);
                    if (!scrollParent) {
                        TourPointer.setState({
                            anchor,
                            content,
                            isZone,
                            onClick: null,
                            position: tooltipPosition,
                            isVisible: true,
                        });
                        return;
                    }
                    let { x, y, width, height } = scrollParent.getBoundingClientRect();

                    // If the scrolling element is within an iframe the offsets
                    // must be computed taking into account the iframe.
                    const iframeEl = scrollParent.ownerDocument.defaultView.frameElement;
                    if (iframeEl) {
                        const iframeOffset = iframeEl.getBoundingClientRect();
                        x += iframeOffset.x;
                        y += iframeOffset.y;
                    }
                    if (intersection.targetPosition === "out-below") {
                        tooltipPosition = "top";
                        content = _t("Scroll down to reach the next step.");
                        floatingAnchor.style.top = `${y + height - TourPointer.height}px`;
                        floatingAnchor.style.left = `${x + width / 2}px`;
                    } else if (intersection.targetPosition === "out-above") {
                        tooltipPosition = "bottom";
                        content = _t("Scroll up to reach the next step.");
                        floatingAnchor.style.top = `${y + TourPointer.height}px`;
                        floatingAnchor.style.left = `${x + width / 2}px`;
                    }
                    if (intersection.targetPosition === "out-left") {
                        tooltipPosition = "right";
                        content = _t("Scroll left to reach the next step.");
                        floatingAnchor.style.top = `${y + height / 2}px`;
                        floatingAnchor.style.left = `${x + TourPointer.width}px`;
                    } else if (intersection.targetPosition === "out-right") {
                        tooltipPosition = "left";
                        content = _t("Scroll right to reach the next step.");
                        floatingAnchor.style.top = `${y + height / 2}px`;
                        floatingAnchor.style.left = `${x + width - TourPointer.width}px`;
                    }
                    if (!document.contains(floatingAnchor)) {
                        document.body.appendChild(floatingAnchor);
                    }
                    TourPointer.setState({
                        anchor: floatingAnchor,
                        content,
                        onClick,
                        position: tooltipPosition,
                        isZone,
                        isVisible: true,
                    });
                }
            }
        } else {
            TourPointer.hide();
        }
    }
}
