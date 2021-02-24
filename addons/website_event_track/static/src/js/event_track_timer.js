odoo.define('website_event_track.event_track_timer', function (require) {

'use strict';

const publicWidget = require('web.public.widget');

/*
 * Simple implementation of a timer widget that uses a "time to live" configuration
 * value to countdown seconds on a target element.
 * Will be used to visually countdown the time before a talk starts.
 * When the timer reaches 0, the element destroys itself.
 */
publicWidget.registry.EventTrackTimer = publicWidget.Widget.extend({

    selector: '.o_we_track_timer',
    events: {
        'click .close': '_onCloseClick',
    },

    /**
     * @override
     */
    start: function () {
        return this._super.apply(this, arguments).then(() => {
            let ttl = this.$el.data('ttl');
            let deadline = moment().add(ttl, 'seconds');
            let dt = deadline.diff(moment());
            if (dt > 0) {
                this._updateTimerDisplay(dt);
                this.$el.removeClass('d-none');
                this.deadline = deadline;
                this.timer = setInterval(this._refreshTimer.bind(this), 1000);
            } else {
                this.destroy();
            }
        });
    },

    /**
     * The function will trigger an update if the timer has not yet expired.
     * Otherwise, the component will be destroyed.
     */
    _refreshTimer: function () {
        let dt = this.deadline.diff(moment());
        if (dt > 0) {
            this._updateTimerDisplay(dt);
        } else {
            this.destroy();
        }
    },

    /**
     * The function will have the responsibility to update the text indicating
     * the time remaining before the counter expires. The function will use
     * MomentJS to transform the remaining time in more a human friendly format
     * Example: "in 32 minutes", "in 17 hours", etc.
     * @param {integer} dt - Time remaining before the counter expires (in ms).
     */
    _updateTimerDisplay: function (dt) {
        let span = this.$el.find('span');
        let str = moment.duration(dt, 'ms').humanize(true);
        if (str !== span.text()) {
            span.text(str);
        }
    },

    /**
     * @override
     */
    destroy: function() {
        this.$el.parent().remove();
        clearInterval(this.timer);
        this._super(...arguments);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    _onCloseClick: function () {
        this.destroy();
    },
});

return publicWidget.registry.EventTrackTimer;

});
