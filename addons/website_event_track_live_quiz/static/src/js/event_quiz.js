odoo.define('website_event_track_live_quiz.event_quiz', function (require) {
'use strict';

var Quiz = require('website_event_track_quiz.event.quiz');

var WebsiteEventTrackSuggestionQuiz = Quiz.include({
    xmlDependencies: Quiz.prototype.xmlDependencies.concat([
        '/website_event_track_live_quiz/static/src/xml/website_event_track_quiz_templates.xml',
    ]),

    /**
     * @override
     */
    willStart: function () {
        var defs = [this._super.apply(this, arguments)];
        defs.push(this._getTrackSuggestion());
        return Promise.all(defs);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    _getTrackSuggestion: function () {
        var self = this;
        return this._rpc({
            route: '/event_track/get_track_suggestion',
            params: {
                track_id: this.track.id,
            }
        }).then(function (suggestion) {
            self.nextSuggestion = suggestion;
        });
    },
});

return WebsiteEventTrackSuggestionQuiz;

});
