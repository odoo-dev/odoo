import { Component, onWillStart, proxy, t, useProps } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

/** Level menu: groups of levels; a group opens the list of its playable sub-levels. */
export class LevelMenu extends Component {
    static template = "scale_up_game.LevelMenu";
    props = useProps({ onPlay: t.function() });

    setup() {
        this.orm = useService("orm");
        this.state = proxy({ groups: [], groupCode: null });
        onWillStart(async () => {
            this.state.groups = await this.orm.call("scale.up.game.level", "get_menu", []);
        });
    }

    get group() {
        return this.state.groups.find((g) => g.code === this.state.groupCode);
    }

    openGroup(group) {
        if (group.available) {
            this.state.groupCode = group.code;
        }
    }

    back() {
        this.state.groupCode = null;
    }
}
