odoo.define('website_event_online.display_timer_widget', function (require) {
'use strict';

var core = require('web.core');
var _t = core._t;
var publicWidget = require('web.public.widget');

publicWidget.registry.displayTimerWidget = publicWidget.Widget.extend({
    selector: '.o_display_timer',
    custom_events: {
        'test': '_someNameIHaveToModify',
    },

    /**
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);
    },

    /**
     * @override
     */
    start: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            self.options = self.$target.data();
            self.startCountdownDisplay = self.options["startCountdownDisplay"];
            self.startCountdownTime = self.options["startCountdownTime"];
            self.startCountdownText = self.options["startCountdownText"];

            self.endCountdownTime = self.options["endCountdownTime"];
            self.endCountdownText = self.options["endCountdownText"];

            self.displayClass = self.options["displayClass"];

            if (self.startCountdownDisplay) {
                $(self.$el).parent().removeClass('d-none');
            }

            self._someNameIHaveToModify()
            self.interval = setInterval(function () { self._someNameIHaveToModify() }, 1000);
        });
    },

    _someNameIHaveToModify: function () {
        var now = new Date();

        var remainingStartSeconds = this.startCountdownTime - (now.getTime()/1000);
        if (remainingStartSeconds <= 1) {
            this.$('.o_countdown_text').text(this.endCountdownText);
            $(this.$el).parent().removeClass('d-none');
            var remainingEndSeconds = this.endCountdownTime - (now.getTime()/1000);
            if (remainingEndSeconds <= 1) {
                clearInterval(this.interval);
                $(this.displayClass).removeClass('d-none');
                $(this.$el).parent().addClass('d-none');
            } else {
                this._updateCountdown(remainingEndSeconds);
            }
        } else {
            this._updateCountdown(remainingStartSeconds);
        }
    },

    _updateCountdown: function (remainingTime) {
        var remainingSeconds = remainingTime;
        var days = Math.floor(remainingSeconds / 86400);

        remainingSeconds = remainingSeconds % 86400;
        var hours = Math.floor(remainingSeconds / 3600);

        remainingSeconds = remainingSeconds % 3600;
        var minutes = Math.floor(remainingSeconds / 60);

        remainingSeconds = Math.floor(remainingSeconds % 60);

        this.$("span.o_timer_days").text(days);
        this.$("span.o_timer_hours").text(this._zeroPad(hours, 2));
        this.$("span.o_timer_minutes").text(this._zeroPad(minutes, 2));
        this.$("span.o_timer_seconds").text(this._zeroPad(remainingSeconds, 2));
    },

    _zeroPad: function(num, places) {
      var zero = places - num.toString().length + 1;
      return Array(+(zero > 0 && zero)).join("0") + num;
    },

});

return publicWidget.registry.countdownWidget;

});
