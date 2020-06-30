odoo.define('website_event_track_live.website_event_track_suggestion', function (require) {
'use strict';

var Widget = require('web.Widget');

var WebsiteEventTrackSuggestion = Widget.extend({
    template: 'website_event_track_live.website_event_track_suggestion',
    xmlDependencies: ['/website_event_track_live/static/src/xml/website_event_track_live_templates.xml'],
    events: {
        'click .owevent_track_suggestion_replay': '_onReplayClick'
    },

    init: function (parent, options) {
        this._super(...arguments);

        this.currentTrack = {
            'name': options.current_track.name,
        };
        this.suggestion = {
            'name': options.suggestion.name,
            'speakerName': options.suggestion.speaker_name,
            'trackUrl': options.suggestion.website_url,
            'imageSrc': options.suggestion.website_image_url,
        };
    },

    start: function () {
        var self = this;
        this._super(...arguments).then(function () {
            self.timerInterval = setInterval(self._updateTimer.bind(self), 1000);
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * If the user clicks on replay, remove this suggestion window and send an
     * event to the parent so that it can rewind the video to the beginning.
     */
    _onReplayClick: function () {
        this.trigger_up('replay');
        clearInterval(this.timerInterval);
        this.destroy();
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    _updateTimer: function () {
        var secondsLeft = parseInt(this.$('.owevent_track_suggestion_timer_text').text());

        if (secondsLeft > 0) {
            secondsLeft -= 1;
            this.$('.owevent_track_suggestion_timer_text').text(secondsLeft);
        }

        if (secondsLeft === 0) {
            window.location = this.suggestion.trackUrl;
        }
    }
});

return WebsiteEventTrackSuggestion;

});
