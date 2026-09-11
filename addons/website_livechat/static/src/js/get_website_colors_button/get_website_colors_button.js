import { registry } from "@web/core/registry";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";
import { useService } from "@web/core/utils/hooks";
import { Component } from "@odoo/owl";

export class GetWebsiteColorsButton extends Component {
    static template = "website_livechat.GetWebsiteColorsButton";
    static props = { ...standardWidgetProps };

    setup() {
        this.orm = useService("orm");
    }

    async onGetWebsiteColorsClick() {
        const colors = await this.orm.call("im_livechat.channel", "get_website_theme_colors", [
            [this.props.record.resId],
        ]);
        await this.props.record.update(colors);
    }
}

export const getWebsiteColorsButton = {
    component: GetWebsiteColorsButton,
};
registry.category("view_widgets").add("get_website_colors_button", getWebsiteColorsButton);
