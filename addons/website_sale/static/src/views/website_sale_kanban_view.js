import { onWillStart } from '@odoo/owl';
import { registry } from '@web/core/registry';
import { user } from "@web/core/user";
import { kanbanView } from '@web/views/kanban/kanban_view';
import { KanbanRenderer } from '@web/views/kanban/kanban_renderer';
import { WebsiteSaleDashboard } from '../js/website_sale_dashboard/website_sale_dashboard';

export class WebsiteSaleKanbanDashboardRenderer extends KanbanRenderer {
    static template = 'website_sale.KanbanRenderer';
    static components = {
        ...KanbanRenderer.components,
        WebsiteSaleDashboard,
    };

    setup() {
        super.setup();
        onWillStart(async () => {
            this.isUserAdmin = await user.hasGroup('base.group_system');
        });
    }
}

export const websiteSaleDashboardKanbanView = {
    ...kanbanView,
    Renderer: WebsiteSaleKanbanDashboardRenderer,
};

registry.category('views').add('website_sale_dashboard_kanban', websiteSaleDashboardKanbanView);
