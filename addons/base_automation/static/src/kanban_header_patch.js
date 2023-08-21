/* @odoo-module */

import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { KanbanHeader } from "@web/views/kanban/kanban_header";
import { TRIGGER_FILTERS } from "./utils";

const SUPPORTED_TRIGGERS = [
    "on_stage_set",
    "on_tag_set",
    "on_state_set",
    "on_priority_set",
    "on_user_set",
    "on_archive",
    "on_unarchive",
];

function enrichContext(group) {
    const { displayName, groupByField, value } = group;
    const { name, relation, type: ttype } = groupByField;
    for (const trigger of SUPPORTED_TRIGGERS) {
        if (!TRIGGER_FILTERS[trigger]({ name, relation, ttype })) {
            continue;
        }
        switch (trigger) {
            case "on_stage_set":
                return {
                    default_trigger: trigger,
                    default_name: _t('Stage is set to "%s"', displayName),
                    default_trg_field_ref: value,
                };
            case "on_tag_set":
                return {
                    default_trigger: trigger,
                    default_name: _t('"%s" tag is added', displayName),
                    default_trg_field_ref: value,
                };
            default:
                return { default_trigger: trigger };
        }
    }

    // Default trigger
    return { default_trigger: "on_create_or_write" };
}

patch(KanbanHeader.prototype, {
    setup() {
        super.setup();
        this.action = useService("action");
        this.user = useService("user");
        this.hasBaseAutomation = true; // used in web_enterprise to avoid displaying btn twice
    },

    async openAutomations() {
        return this._openAutomations();
    },

    async _openAutomations() {
        const domain = [["model", "=", this.props.list.resModel]];
        const modelId = await this.orm.search("ir.model", domain, { limit: 1 });
        const context = {
            active_test: false,
            default_model_id: modelId[0],
            search_default_model_id: modelId[0],
            ...enrichContext(this.group),
        };
        this.action.doAction({
            name: _t("Automation Rules"),
            res_model: "base.automation",
            views: [
                [false, "kanban"],
                [false, "form"],
            ],
            type: "ir.actions.act_window",
            target: "current",
            context: context,
        });
    },
});
