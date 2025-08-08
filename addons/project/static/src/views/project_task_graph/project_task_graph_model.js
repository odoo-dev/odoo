import { GraphModel } from "@web/views/graph/graph_model";
import { ProjectTaskModelMixin } from "../project_task_model_mixin";

export class ProjectTaskGraphModel extends ProjectTaskModelMixin(GraphModel) {
    async load(searchParams) {
        if (this.metaData.resModel === "project.task") {
            const domain = searchParams.domain || [];
            searchParams.domain = this._processSearchDomain(domain);
        }
        return super.load(searchParams);
    }
}
