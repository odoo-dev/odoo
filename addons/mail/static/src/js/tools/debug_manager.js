import { usePlugin } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

export function manageMessages({ component }) {
    const action = usePlugin(ActionPlugin);
    const resId = component.model.root.resId;
    if (!resId) {
        return null; // No record
    }
    const description = _t("Messages");
    return {
        type: "item",
        description,
        callback: () => {
            action.doAction({
                res_model: "mail.message",
                name: description,
                views: [
                    [false, "list"],
                    [false, "form"],
                ],
                type: "ir.actions.act_window",
                domain: [
                    ["res_id", "=", resId],
                    ["model", "=", component.props.resModel],
                ],
                context: {
                    default_res_model: component.props.resModel,
                    default_res_id: resId,
                },
            });
        },
        sequence: 130,
        section: "record",
    };
}

registry.category("debug").category("form").add("mail.manageMessages", manageMessages);
