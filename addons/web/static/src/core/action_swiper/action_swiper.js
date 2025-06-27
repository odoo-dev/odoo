import { browser } from "@web/core/browser/browser";
import { localization } from "@web/core/l10n/localization";
import { clamp } from "@web/core/utils/numbers";
import { hasTouch } from "@web/core/browser/feature_detection";

import { Component, onMounted, onWillUnmount, useRef, useState } from "@odoo/owl";

const isScrollSwipable = (scrollables) => ({
    left: !scrollables.filter((e) => e.scrollLeft !== 0).length,
    right: !scrollables.filter(
        (e) => e.scrollLeft + Math.round(e.getBoundingClientRect().width) !== e.scrollWidth
    ).length,
});

/**
 * Action Swiper
 *
 * This component is intended to perform action once a user has completed a touch swipe.
 * You can choose the direction allowed for such behavior (left, right or both).
 * The action to perform must be passed as a props. It is possible to define a condition
 * to allow the swipe interaction conditionnally.
 * @extends Component
 */
export class ActionSwiper extends Component {
    static template = "web.ActionSwiper";
    static props = {
        onLeftSwipe: {
            type: Object,
            args: {
                action: Function,
                icon: String,
                bgColor: String,
                slot: Object,
            },
            optional: true,
        },
        onRightSwipe: {
            type: Object,
            args: {
                action: Function,
                icon: String,
                bgColor: String,
                slot: Object,
            },
            optional: true,
        },
        enabledDuration: {
            type: Number,
            optional: true
        },
        slots: Object,
        animationType: { type: String, optional: true },
    };
    static defaultProps = {
        onLeftSwipe: undefined,
        onRightSwipe: undefined,
        animationType: "bounce",
    };
    static swipeDistanceRatio = 2;
    static swipeEffectiveThreshold = 20;
    static animationLength = 400;

    setup() {
        this.actionTimeoutId = null;
        this.resetTimeoutId = null;
        this.defaultState = {
            containerStyle: "",
            isSwiping: false,
            width: undefined,
        };
        this.root = useRef("root");
        this.targetContainer = useRef("targetContainer");
        this.state = useState({ ...this.defaultState });
        this.scrollables = undefined;
        this.startX = undefined;
        this.swipedDistance = 0;
        this.isScrollValidated = false;
        const _onTouchMove = (ev) => this._onTouchMoveSwipe(ev);
        const _onTouchEnd = (ev) => this._onTouchEndSwipe(ev);
        onMounted(() => {
            if (this.localizedProps) {
                this.root.el.addEventListener("touchmove", _onTouchMove, { capture: true });
                this.root.el.addEventListener("touchend", _onTouchEnd, { capture: true });
            }
        });
        onWillUnmount(() => {
            browser.clearTimeout(this.actionTimeoutId);
            browser.clearTimeout(this.resetTimeoutId);
            browser.clearTimeout(this.enabledTimeout);
        });
    }
    get localizedProps() {
        const onLeftSwipe = localization.direction === "rtl" ? this.props.onRightSwipe : this.props.onLeftSwipe;
        const onRightSwipe = localization.direction === "rtl" ? this.props.onLeftSwipe : this.props.onRightSwipe;
        if (!hasTouch() || (!onRightSwipe && !onLeftSwipe)) {
            return;
        }
        return{ onLeftSwipe, onRightSwipe };
    }

    /**
     * @private
     * @param {TouchEvent} ev
     */
    _onTouchEndSwipe(ev) {
        if (this.isScrollValidated) {
            ev.stopPropagation();
            ev.preventDefault();
            this.state.isSwiping = false;
            if (this.localizedProps.onRightSwipe && this.swipedDistance > this.state.width / this.constructor.swipeDistanceRatio) {
                this.swipedDistance = this.state.width;
                this.handleSwipe(this.localizedProps.onRightSwipe.action);
                return;
            } else if (
                this.localizedProps.onLeftSwipe &&
                this.swipedDistance < -this.state.width / this.constructor.swipeDistanceRatio
            ) {
                this.swipedDistance = -this.state.width;
                this.handleSwipe(this.localizedProps.onLeftSwipe.action);
                return;
            }
        }
        this.state.containerStyle = "";
        this.resetTimeoutId = browser.setTimeout(() => this._reset(), this.constructor.animationLength);
    }
    /**
     * @private
     * @param {TouchEvent} ev
     */
    _onTouchMoveSwipe(ev) {
        if (this.state.isSwiping) {
            browser.clearTimeout(this.enabledTimeout);
            const { onLeftSwipe, onRightSwipe } = this.localizedProps;
            this.swipedDistance = clamp(
                ev.touches[0].clientX - this.startX,
                onLeftSwipe ? -this.state.width : 0,
                onRightSwipe ? this.state.width : 0
            );
            ev.stopPropagation();
            if (this.isScrollValidated) {
                // Prevent the browser to navigate back/forward when using swipe
                // gestures while still allowing to scroll vertically.
                ev.preventDefault();
                this.state.containerStyle = `transform: translateX(${this.swipedDistance}px)`;
            } else {
                // If there are scrollable elements under touch pressure,
                // they must be at their limits to allow swiping.
                if (
                    this.scrollables &&
                    !isScrollSwipable(this.scrollables)[this.swipedDistance > 0 ? "left" : "right"]
                ) {
                    return this._reset();
                }
                if (Math.abs(this.swipedDistance) > this.constructor.swipeEffectiveThreshold) {
                    this.isScrollValidated = true;
                }
            }
        }
    }
    /**
     * @private
     * @param {TouchEvent} ev
     */
    _onTouchStartSwipe(ev) {
        if (this.isScrollValidated) {
            return;
        }
        this.scrollables = ev
            .composedPath()
            .filter(
                (e) =>
                    e.nodeType === 1 &&
                    this.targetContainer.el.contains(e) &&
                    e.scrollWidth > e.getBoundingClientRect().width &&
                    ["auto", "scroll"].includes(window.getComputedStyle(e)["overflow-x"])
            );
        if (!this.state.width) {
            this.state.width =
                this.targetContainer && this.targetContainer.el.getBoundingClientRect().width;
        }
        this.state.isSwiping = true;
        this.startX = ev.touches[0].clientX;
        if (this.props.enabledDuration) {
            this.enabledTimeout = browser.setTimeout(() => this._reset(), this.props.enabledDuration);
        }
    }

    /**
     * @private
     */
    _reset() {
        Object.assign(this.state, { ...this.defaultState });
        this.scrollables = undefined;
        this.startX = undefined;
        this.swipedDistance = 0;
        this.isScrollValidated = false;
    }

    handleSwipe(action) {
        if (this.props.animationType === "bounce") {
            this.state.containerStyle = `transform: translateX(${this.swipedDistance}px)`;
            this.actionTimeoutId = browser.setTimeout(async () => {
                await action();
                this._reset();
            }, this.constructor.animationLength);
        } else if (this.props.animationType === "forwards") {
            this.state.containerStyle = `transform: translateX(${this.swipedDistance}px)`;
            this.actionTimeoutId = browser.setTimeout(async () => {
                await action();
                this.targetContainer.el.style.transition = "none";
                this.targetContainer.el.style.transform = "translateX(0)";
                requestAnimationFrame(() => this._reset());
            }, this.constructor.animationLength);
        }
    }
}
