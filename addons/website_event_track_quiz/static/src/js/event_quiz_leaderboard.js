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
            var scrollToEl = self.el.querySelector(".o_wevent_quiz_scroll_to");
            if (scrollToEl) {
                var offset = document.querySelector(".o_header_standard").getBoundingClientRect().height;
                var appMenuEl = document.querySelector(".o_main_navbar");
                if (appMenuEl) {
                    offset += appMenuEl.offsetHeight;
                }
                window.scrollTo({
                    top: scrollToEl.getBoundingClientRect().top - offset,
                    behavior: 'smooth'
                });
            }
        });
    }
});

export default publicWidget.registry.EventLeaderboard;
