import { Component, t, usePlugin, useProps } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { _t } from "@web/core/l10n/translation";
import { UIPlugin } from "@web/core/ui/ui_plugin";

export class Breadcrumbs extends Component {
    static template = "web.Breadcrumbs";
    static components = { Dropdown, DropdownItem };
    props = useProps({
        breadcrumbs: t.array(),
        slots: t.object().optional(),
    });

    setup() {
        this.uiService = usePlugin(UIPlugin);
    }

    getBreadcrumbTooltip({ isFormView, name }) {
        if (isFormView) {
            return _t("Back to “%s” form", name);
        }
        return _t("Back to “%s”", name);
    }
}
