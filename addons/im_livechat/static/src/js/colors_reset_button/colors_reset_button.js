import { registry } from "@web/core/registry";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";
import { useService } from "@web/core/utils/hooks";
import { Component } from "@odoo/owl";

export class ColorsResetButton extends Component {
    static template = `im_livechat.ColorsResetButton`;
    static props = { ...standardWidgetProps };

    setup() {
        this.orm = useService("orm");
    }

    async onColorsResetButtonClick() {
        await this.orm.call("im_livechat.channel", "action_reset_colors", [
            [this.props.record.resId],
        ]);
        await this.props.record.load();
    }
}

export const colorsResetButton = {
    component: ColorsResetButton,
};
registry.category("view_widgets").add("colors_reset_button", colorsResetButton);
