import { onWillStart } from '@odoo/owl';
import { registry } from '@web/core/registry';
import { user } from "@web/core/user";
import { listView } from '@web/views/list/list_view';
import { ListRenderer } from '@web/views/list/list_renderer';
import { WebsiteSaleDashboard } from '../js/website_sale_dashboard/website_sale_dashboard';

export class WebsiteSaleListDashboardRenderer extends ListRenderer {
    static template = 'website_sale.ListRenderer';
    static components = {
        ...ListRenderer.components,
        WebsiteSaleDashboard,
    };

    setup() {
        super.setup();
        onWillStart(async () => {
            this.isUserAdmin = await user.hasGroup('base.group_system');
        });
    }
}

export const websiteSaleDashboardListView = {
    ...listView,
    Renderer: WebsiteSaleListDashboardRenderer,
};

registry.category('views').add('website_sale_dashboard_list', websiteSaleDashboardListView);
