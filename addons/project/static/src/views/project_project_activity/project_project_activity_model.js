import { ActivityModel } from "@mail/views/web/activity/activity_model";
import { ProjectModelPlugin } from "../../plugins/project_model_plugin";
import { plugin } from "@odoo/owl";

export class ProjectActivityModel extends ActivityModel {
    projectModelPlugin = plugin(ProjectModelPlugin);

    async load(params = {}) {
        const domain = params.domain || this.config.domain;
        params.domain = this.projectModelPlugin.processSearchDomain(domain, this.env.searchModel.context);
        return super.load(params);
    }
}
