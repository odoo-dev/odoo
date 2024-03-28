/** @odoo-module **/

import { queryAll } from "@odoo/hoot-dom";
import { registry } from "@web/core/registry";

/**
 * Global use case:
 * an user (either employee, website restricted editor or portal) joins a public
    course;
 * they have access to the full course content when they are a member of the
    course;
 * they use fullscreen player to complete the course;
 * they rate the course;
 */
registry.category("web_tour.tours").add('course_member', {
    url: '/slides',
    test: true,
    steps: () => [
// eLearning: go on free course and join it
{
    trigger: 'a:contains("Basics of Gardening - Test")'
}, {
    trigger: 'a:contains("Join this Course")'
}, {
    trigger: '.o_wslides_js_course_join:contains("You\'re enrolled")',
    run: function () {} // check membership
}, {
    trigger: 'a:contains("Gardening: The Know-How")',
},
// eLearning: follow course by cliking on first lesson and going to fullscreen player
{
    trigger: '.o_wslides_fs_slide_name:contains("Home Gardening")',
    run: 'click',
},
// eLearning: share the first slide
{
    trigger: '.o_wslides_fs_share'
}, {
    trigger: '.o_wslides_js_share_email input',
    run: "edit friend@example.com",
}, {
    trigger: '.o_wslides_js_share_email button',
}, {
    trigger: '.o_wslides_js_share_email:contains("Sharing is caring")',
    run: function () {}  // check email has been sent
}, {
    trigger: '.modal-footer button:contains("Close")',
},
// eLeaning: course completion
{
    trigger: '.o_wslides_fs_sidebar_header',
    run(helpers) {
        // check navigation with arrow keys
        // go back once
        helpers.press("ArrowLeft");
        // check that it selected the previous tab
        if (
            queryAll(
                '.o_wslides_fs_sidebar_list_item.active:contains("Gardening: The Know-How")'
            ).length === 0
        ) {
            return;
        }
        // getting here means that navigation worked
        document
            .querySelector(".o_wslides_fs_sidebar_header")
            .classList.add("navigation-success-1");
    }
}, {
    trigger: '.o_wslides_fs_sidebar_header.navigation-success-1',
    extra_trigger: '.o_wslides_progress_percentage:contains("40")',
    run(helpers) {
        // check navigation with arrow keys
        helpers.press("ArrowRight");
        // check that it selected the next/next tab
        if (
            queryAll('.o_wslides_fs_sidebar_list_item.active:contains("Home Gardening")')
                .length === 0
        ) {
            return;
        }
        // getting here means that navigation worked
        document
            .querySelector(".o_wslides_fs_sidebar_header")
            .classList.add("navigation-success-2");
    }
}, {
    trigger: '.o_wslides_progress_percentage:contains("40")',
    run: function () {} // check progression
}, {
    trigger: '.o_wslides_fs_sidebar_header.navigation-success-2',
    extra_trigger: '.o_wslides_progress_percentage:contains("40")',
    run(helpers) {
        // check navigation with arrow keys
        setTimeout(function () {
            helpers.press("ArrowRight");
            // check that it selected the next/next tab
            if (
                queryAll(
                    '.o_wslides_fs_sidebar_list_item.active:contains("Mighty Carrots")'
                ).length === 0
            ) {
                return;
            }
            // getting here means that navigation worked
            document
                .querySelector(".o_wslides_fs_sidebar_header")
                .classList.add("navigation-success-3");
        }, 300);
    }
}, {
    trigger: '.o_wslides_progress_percentage:contains("60")',
    run: function () {} // check progression
}, {
    trigger: '.o_wslides_fs_sidebar_header.navigation-success-3',
    extra_trigger: '.o_wslides_progress_percentage:contains("60")',
    run: function () {} // check that previous step succeeded
}, {
    trigger: '.o_wslides_fs_slide_name:contains("How to Grow and Harvest The Best Strawberries | Basics")',
    run: 'click',
}, {
    trigger: '.o_wslides_fs_sidebar_section_slides li:contains("How to Grow and Harvest The Best Strawberries | Basics") .o_wslides_slide_completed',
    run: function () {} // check that video slide is marked as 'done'
}, {
    trigger: '.o_wslides_progress_percentage:contains("80")',
    run: function () {} // check progression
},
// eLearning: last slide is a quiz, complete it
{
    trigger: '.o_wslides_fs_slide_name:contains("Test your knowledge")',
    run: 'click',
}, {
    trigger: '.o_wslides_js_lesson_quiz_question:first .list-group a:first'
}, {
    trigger: '.o_wslides_js_lesson_quiz_question:last .list-group a:first'
}, {
    trigger: '.o_wslides_js_lesson_quiz_submit'
}, {
    // check that we have a properly motivational message to motivate us!
    trigger: '.o_wslides_quiz_modal_rank_motivational > div > div:contains("Reach the next rank and gain a very nice mug!")'
}, {
    trigger: 'a:contains("End course")'
},
// eLearning: ending course redirect to /slides, course is completed now
{
    trigger: 'div:contains("Basics of Gardening") span:contains("Completed")',
    run: function () {} // check that the course is marked as completed
},
// eLearning: go back on course and rate it (new rate or update it, both should work)
{
    trigger: 'a:contains("Basics of Gardening")'
}, {
    trigger: 'button[data-bs-target="#ratingpopupcomposer"]'
}, {
    trigger: 'div.o_portal_chatter_composer_input i.fa:eq(2)',
    extra_trigger: 'div.modal_shown',
    run: 'click',
    in_modal: false,
}, {
    trigger: 'div.o_portal_chatter_composer_input textarea',
    run: "edit This is a great course. Top !",
    in_modal: false,
}, {
    trigger: 'button.o_portal_chatter_composer_btn',
    in_modal: false,
}, {
    trigger: 'a[id="review-tab"]'
}, {
    trigger: '.o_portal_chatter_message:contains("This is a great course. Top !")',
    run: function () {}, // check review is correctly added
}
]});
