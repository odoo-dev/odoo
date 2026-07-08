import { plugin } from "@odoo/owl";
import { RelationalModel } from "@web/model/relational_model/relational_model";
import { ProjectModelPlugin } from "../plugins/project_model_plugin";

export class ProjectRelationalModel extends RelationalModel {
    projectModelPlugin = plugin(ProjectModelPlugin);

    async load(params = {}) {
        const domain = params.domain || this.config.domain;
        params.domain = this.projectModelPlugin.processSearchDomain(domain, this.env.searchModel.context);
        return super.load(params);
    }
}
