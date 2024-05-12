/** @odoo-module **/

import publicWidget from "@web/legacy/js/public/public_widget";

publicWidget.registry.EventLeaderboard = publicWidget.Widget.extend({
    selector: '.o_wevent_quiz_leaderboard',

    /**
     * Basic override to scroll to current visitor's position.
     */
    start: function () {
        var self = this;
        return this._super(...arguments).then(function () {
            var scrollTo = self.el.querySelector(".o_wevent_quiz_scroll_to");
            if (scrollTo !== null) {
                var offset = document.querySelector(".o_header_standard").getBoundingClientRect().height;
                var appMenu = document.querySelector(".o_main_navbar");
                if (appMenu !== null) {
                    offset += appMenu.offsetHeight;
                }
                window.scrollTo({
                    top: scrollTo.getBoundingClientRect().top + window.scrollY - offset,
                    behavior: 'smooth'
                });
            }
        });
    }
});

export default publicWidget.registry.EventLeaderboard;
