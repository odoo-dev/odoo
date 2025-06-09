export const ProjectTaskAnalysisRendererMixin = (T) => class ProjectTaskAnalysisRendererMixin extends T {
    _getActionMeta() {
        return {
            name: "Tasks",
            res_model: "project.task",
        };
    }
}
