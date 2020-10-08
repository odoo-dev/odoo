import { Service, OdooEnv, ViewType } from "../types";

interface ViewManager {
  loadView(model: string, type: ViewType, viewId?: number | false): Promise<ViewDefinition>;
}

interface ViewDefinition {
  arch: string;
  type: ViewType;
  viewId: number;
}

export const viewManagerService: Service<ViewManager> = {
  name: "view_manager",
  dependencies: ["model"],
  deploy(env: OdooEnv): ViewManager {
    const modelService = env.services.model;

    const loadView = async (model: string, type: ViewType, viewId: number | false = false) => {
      const data = await modelService(model).call("load_views", [], {
        options: { toolbar: true },
        views: [[viewId, type]],
      });
      const viewData = data.fields_views[type];
      return { arch: viewData.arch, viewId: viewData.view_id, type };
    };
    return { loadView };
  },
};
