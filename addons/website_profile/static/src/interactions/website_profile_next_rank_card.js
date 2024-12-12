
import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

class websiteProfileNextRankCard extends Interaction {
    static selector = ".o_wprofile_progress_circle"

    setup() {
        new Tooltip(this.el.querySelector('g[data-bs-toggle="tooltip"]'));
    }
}

registry
    .category("public.interactions")
    .add("website_profile.website_profile_next_rank_card", websiteProfileNextRankCard);
