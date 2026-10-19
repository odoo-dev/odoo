import { usePlugin } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";
import { LearningModePlugin } from "../services/learning_mode_plugin";

function learningModeItem() {
    const learning = usePlugin(LearningModePlugin);
    return {
        type: "item",
        id: "learning_mode",
        description: learning.active() ? _t("Turn off learning mode") : _t("Learning mode"),
        callback: () => learning.setActive(!learning.active()),
        sequence: 15,
    };
}

function learningMapItem() {
    const learning = usePlugin(LearningModePlugin);
    const action = usePlugin(ActionPlugin);
    return {
        type: "item",
        id: "learning_map",
        description: _t("Learning map"),
        hide: !learning.active(),
        callback: () => action.doAction("learning.learning_map_action"),
        sequence: 16,
    };
}

registry
    .category("user_menuitems")
    .add("learning_mode", learningModeItem)
    .add("learning_map", learningMapItem);
