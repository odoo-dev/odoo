import { plugin } from '@odoo/owl';
import { CalendarModel } from '@web/views/calendar/calendar_model';
import { ProjectModelPlugin } from '../../plugins/project_model_plugin';

export class ProjectCalendarModel extends CalendarModel {
    projectModelPlugin = plugin(ProjectModelPlugin);

    async load(params = {}) {
        const domain = params.domain || this.meta.domain;
        params.domain = this.projectModelPlugin.processSearchDomain(domain, this.env.searchModel.context);
        return super.load(params);
    }
}
