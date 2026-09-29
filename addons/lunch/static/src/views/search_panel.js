import { usePlugin } from "@odoo/owl";
import { UIPlugin } from "@web/core/ui/ui_plugin";
import { SearchPanel } from "@web/search/search_panel/search_panel";
import { SIZES } from "@web/core/ui/ui_utils";

export class LunchSearchPanel extends SearchPanel {
    setup() {
        super.setup();
        this.ui = usePlugin(UIPlugin);
        this.state.sidebarExpanded = this.ui.size <= SIZES.LG ? false : true;
    }
}
