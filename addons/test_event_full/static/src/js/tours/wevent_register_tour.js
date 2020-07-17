odoo.define('test_event_full.tour.register', function (require) {
"use strict";

var tour = require('web_tour.tour');

/**
 * The purpose of this tour is to check the whole certification flow:
 *
 * -> student (= demo user) checks 'on payment' course content
 * -> clicks on "buy course"
 * -> is redirected to webshop on the product page
 * -> buys the course
 * -> fails 3 times, exhausting his attempts
 * -> is removed to the members of the course
 * -> buys the course again
 * -> succeeds the certification
 * -> has the course marked as completed
 * -> has the certification in his user profile
 *
 */

// _discoverTalkSteps: function (talkName) {
//     return [{
//         content: 'Go on "What This Event Is All About" Keynote talk',
//         trigger: 'a:contains("What This Event Is All About")',
//     }, {
//         content: "Check Reminder is on (Keynote)",
//         trigger: 'div.o_wetrack_js_reminder i.fa-bell',
//         extra_trigger: 'span.o_wetrack_js_reminder_text:contains("Reminder On")',
//         run: function () {}, // it's a check
//     }]
// }


var initTourSteps = [{
    content: 'Go on Online Reveal page',
    trigger: 'a[href*="/event"]:contains("Online Reveal"):first',
}];

var browseTalksSteps = [{
    content: 'Browse Talks',
    trigger: 'a:contains("Talks")',
}, {
    content: 'Go on "What This Event Is All About" Keynote talk',
    trigger: 'a:contains("What This Event Is All About")',
}, {
    content: "Check Reminder is on (Keynote)",
    trigger: 'div.o_wetrack_js_reminder i.fa-bell',
    extra_trigger: 'span.o_wetrack_js_reminder_text:contains("Reminder On")',
    run: function () {}, // it's a check
}, {
    content: 'Browse Talks',
    trigger: 'a:contains("Talks")',
}, {
    content: 'Click on Live Track',
    trigger: 'article span:contains("Live Track (TEST)")',
    run: 'click'
}, {
    content: "Check Live Track content",
    trigger: 'p:contains("Addison Olson works in IT sector")',
    run: function () {}, // it's a check
}, {
    content: "Check Reminder is Off",
    trigger: 'span.o_wetrack_js_reminder_text:contains("Set Reminder")',
    run: function () {}, // it's a check
}, {
    content: "Set Reminder",
    trigger: 'span.o_wetrack_js_reminder_text',
    run: 'click',
}, {
    content: "Check Reminder is On",
    trigger: 'div.o_wetrack_js_reminder i.fa-bell',
    extra_trigger: 'span.o_wetrack_js_reminder_text:contains("Reminder On")',
    run: function () {}, // it's a check
}];

var browseExhibitorsSteps = [{
    content: 'Browse Talks',
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
        initTourSteps,
        browseTalksSteps,
        browseExhibitorsSteps,
        browseMeetSteps,
        registerSteps
    )
);

});
