import { registry } from "@web/core/registry";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";
import { useService } from "@web/core/utils/hooks";
import { Component, useEffect, useProps } from "@odoo/owl";

export class ThemeColorsLiveSync extends Component {
    static template = "website_livechat.ThemeColorsLiveSync";
    props = useProps(standardWidgetProps);

    setup() {
        const busService = useService("bus_service");
        useEffect(() => {
            const resId = this.props.record.resId;
            if (!resId) {
                return;
            }
            const channel = `im_livechat.channel_${resId}/theme_sync`;
            busService.addChannel(channel);
            const unsubscribe = busService.subscribe(
                "im_livechat.channel/theme_colors_synced",
                (payload) => {
                    if (payload.id === resId) {
                        this.props.record.load();
                    }
                }
            );
            return () => {
                unsubscribe();
                busService.deleteChannel(channel);
            };
        });
    }
}

export const themeColorsLiveSync = {
    component: ThemeColorsLiveSync,
};
registry.category("view_widgets").add("theme_colors_live_sync", themeColorsLiveSync);
