
import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { withSequence } from "@html_editor/utils/resource";

export class TeamBoardCardTopPlugin extends Plugin {
    static id = "teamBoardCardTop";

    resources = {
        get_overlay_buttons: {
            getButtons: (el) => {
                if (!el.matches(".s_team_board_member")) {
                    return [];
                }

                return [{
                    class: "oi oi-fw fw-bolder",
                    icon: "arrow_upward",
                    title: _t("Move to first position"),
                    handler: () => el.parentElement.prepend(el),
                }];
            },
        },
    };
}

registry.category("website-plugins").add(TeamBoardCardTopPlugin.id, TeamBoardCardTopPlugin);
