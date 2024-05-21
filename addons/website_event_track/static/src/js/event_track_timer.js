/** @odoo-module **/

import { formatDuration } from "@web/core/l10n/dates";
import publicWidget from "@web/legacy/js/public/public_widget";
import { _t } from "@web/core/l10n/translation";
const { DateTime } = luxon;

/*
 * Simple implementation of a timer widget that uses a "time to live" configuration
 * value to countdown seconds on a target element.
 * Will be used to visually countdown the time before a talk starts.
 * When the timer reaches 0, the element destroys itself.
 */
publicWidget.registry.websiteEventTrackTimer = publicWidget.Widget.extend({

    selector: '.o_we_track_timer',
    events: {
        'click .close': '_onCloseClick',
    },

    /**
     * @override
     */
    start: function () {
        return this._super.apply(this, arguments).then(() => {
            const timeToLive = this.el.dataset.timeToLive;
            let deadline = DateTime.now().plus({ seconds: timeToLive });
            let remainingMs = deadline.diff(DateTime.now()).as("milliseconds");
            if (remainingMs > 0) {
                this._updateTimerDisplay(remainingMs);
                this.el.classList.remove("d-none");
                this.deadline = deadline;
                this.timer = setInterval(this._refreshTimer.bind(this), 1000);
            } else {
                this.destroy();
            }
        });
    },

    /**
     * @override
     */
    destroy: function () {
        this.el.parentNode.remove();
        clearInterval(this.timer);
        this._super(...arguments);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    _onCloseClick: function () {
        this.destroy();
    },

    /**
     * The function will trigger an update if the timer has not yet expired.
     * Otherwise, the component will be destroyed.
     */
    _refreshTimer: function () {
        let remainingMs = this.deadline.diffNow().as("milliseconds");
        if (remainingMs > 0) {
            this._updateTimerDisplay(remainingMs);
        } else {
            this.destroy();
        }
    },

    /**
     * The function will have the responsibility to update the text indicating
     * the time remaining before the counter expires. The function will use
     * Luxon to transform the remaining time in more a human friendly format
     * Example: "in 32 minutes", "in 17 hours", etc.
     * @param {integer} remainingMs - Time remaining before the counter expires (in ms).
     */
    _updateTimerDisplay: function (remainingMs) {
        const timerTextEl = this.el.querySelector("span");
        const humanDuration = formatDuration(remainingMs / 1000, true);
        const str = _t("in %s", humanDuration);
        if (str !== timerTextEl.textContent) {
            timerTextEl.textContent = str;
        }
    },
});

export default publicWidget.registry.websiteEventTrackTimer;
