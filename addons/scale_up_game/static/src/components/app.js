import { Component, proxy, useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { standardActionServiceProps } from "@web/webclient/actions/action_plugin";
import { GameRoot } from "@scale_up_game/components/game_root";
import { LevelMenu } from "@scale_up_game/components/level_menu";

/** Client action: the level menu, then the game of the chosen sub-level. */
export class ScaleUpApp extends Component {
    static template = "scale_up_game.App";
    static components = { GameRoot, LevelMenu };
    props = useProps({ ...standardActionServiceProps });

    setup() {
        this.state = proxy({ levelCode: null, attempt: 0 });
    }

    play = (levelCode) => {
        this.state.levelCode = levelCode;
        this.state.attempt++;
    };

    exit = () => {
        this.state.levelCode = null;
    };

    // New key => the game component is rebuilt and starts a fresh attempt.
    replay = () => {
        this.state.attempt++;
    };
}

registry.category("actions").add("scale_up_game.game_root", ScaleUpApp);
