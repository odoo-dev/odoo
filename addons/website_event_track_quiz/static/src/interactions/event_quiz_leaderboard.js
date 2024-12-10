import { Interaction } from "@website/core/interaction";
import { registry } from "@web/core/registry";

export class EventQuizLeaderboard extends Interaction {
    static selector = ".o_wevent_quiz_leaderboard"

    start() {
        const scrollTo = this.el.querySelector(".o_wevent_quiz_scroll_to");
        if (scrollTo) {
            const offset = document.querySelector(".o_header_standard").getBoundingClientRect().bottom
                + document.querySelector(".o_main_navbar")?.getBoundingClientRect().height;
            window.scrollTo({ top: scrollTo.getBoundingClientRect().top - offset, behavior: "smooth" })
        }
    }
}

registry
    .category("public.interactions")
    .add("website_event_track_quiz.event_quiz_leaderboard", EventQuizLeaderboard);
