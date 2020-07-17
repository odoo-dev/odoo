odoo.define('test_event_full.tour.register', function (require) {
"use strict";

var tour = require('web_tour.tour');

/**
 * TALKS STEPS
 */

var discoverTalkSteps = function (talkName, fromList, reminderOn, toggleReminder) {
    var steps;
    if (fromList) {
        steps = [{
            content: 'Go on "' + talkName + '" talk in List',
            trigger: 'a:contains("' + talkName + '")',
        }];
    }
    else {
        steps = [{
            content: 'Click on Live Track',
            trigger: 'article span:contains("' + talkName + '")',
            run: 'click'
        }];
    }
    if (reminderOn) {
        steps = steps.concat([{
            content: "Check Reminder is on",
            trigger: 'div.o_wetrack_js_reminder i.fa-bell',
            extra_trigger: 'span.o_wetrack_js_reminder_text:contains("Reminder On")',
            run: function () {}, // it's a check
        }]);
    }
    else {
        steps = steps.concat([{
            content: "Check Reminder is Off",
            trigger: 'span.o_wetrack_js_reminder_text:contains("Set Reminder")',
            run: function () {}, // it's a check
        }]);
        if (toggleReminder) {
            steps = steps.concat([{
                content: "Set Reminder",
                trigger: 'span.o_wetrack_js_reminder_text',
                run: 'click',
            }, {
                content: "Check Reminder is On",
                trigger: 'div.o_wetrack_js_reminder i.fa-bell',
                extra_trigger: 'span.o_wetrack_js_reminder_text:contains("Reminder On")',
                run: function () {}, // it's a check
            }]);
        }
    }
    return steps;
};


/**
 * MAIN STEPS
 */

var initTourSteps = function (eventName) {
    return [{
        content: 'Go on "' + eventName + '" page',
        trigger: 'a[href*="/event"]:contains("' + eventName + '"):first',
    }];
};

var browseTalksSteps = [{
    content: 'Browse Talks',
    trigger: 'a:contains("Talks")',
}];

var browseExhibitorsSteps = [{
    content: 'Browse Exhibitors',
    trigger: 'a:contains("Exhibitors")',
}];

var browseMeetSteps = [{
    content: 'Browse Meet',
    trigger: 'a:contains("Community")',
}];

var registerSteps = [{
    content: 'Go on Register',
    trigger: 'li.btn-primary a:contains("Register")',
}];

tour.register('wevent_register', {
    url: '/event',
    test: true
}, [].concat(
        initTourSteps('Online Reveal'),
        browseTalksSteps,
        discoverTalkSteps('What This Event Is All About', true, true),
        browseTalksSteps,
        discoverTalkSteps('Live Testimonial', false, false, true),
        browseMeetSteps,
        registerSteps
    )
);

});
