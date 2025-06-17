import { _t } from "@web/core/l10n/translation";
import { Ribbon } from "@web/core/ribbon/ribbon";
import { registry } from "@web/core/registry";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";

/**
 * This widget adds a ribbon on the top right side of the form
 *
 *      - You can specify the text with the title prop.
 *      - You can specify the title (tooltip) with the tooltip prop.
 *      - You can specify a background color for the ribbon with the bg_color prop
 *        using bootstrap classes :
 *        (bg-primary, bg-secondary, bg-success, bg-danger, bg-warning, bg-info,
 *        bg-light, bg-dark, bg-white)
 *
 *        If you don't specify the bg_color prop the bg-success class will be used
 *        by default.
 */
class RibbonWidget extends Ribbon {
    static props = {
        ...standardWidgetProps,
        ...Ribbon.props,
    };
}

export const ribbonWidget = {
    component: RibbonWidget,
    extractProps: ({ attrs }) => ({
        text: attrs.title || attrs.text,
        title: attrs.tooltip,
        bgClass: attrs.bg_color,
    }),
    supportedAttributes: [
        {
            label: _t("Title"),
            name: "title",
            type: "string",
        },
        {
            label: _t("Background color"),
            name: "bg_color",
            type: "string",
        },
        {
            label: _t("Tooltip"),
            name: "tooltip",
            type: "string",
        },
    ],
};

registry.category("view_widgets").add("web_ribbon", ribbonWidget);
