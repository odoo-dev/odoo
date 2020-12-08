import { Component, hooks, tags } from "@odoo/owl";
import {
  ClientActionProps,
  OdooEnv,
  ViewProps,
  Service,
  ViewId,
  ViewType,
  MenuElement,
  Type,
} from "../types";
import { useService } from "../core/hooks";
import {
  ActionManagerUpdateInfo, Breadcrumbs, useSetupAction,
  ViewNotFoundError,
} from "../action_manager/action_manager";
import { actionRegistry } from "../action_manager/action_registry";
import { viewRegistry } from "../views/view_registry";
import { Context } from "../core/context";
import { useDebugManager } from "../debug_manager/debug_manager";
import { DebuggingAccessRights, editModelDebug } from "../debug_manager/debug_manager_service";
import { ActWindowAction, ClientAction } from "../action_manager/action_manager";
import { Dialog } from "../components/dialog/dialog";
import { json_node_to_xml } from "../utils/misc";
import { formatDateTime, formatMany2one, parseDateTime } from "../utils/fields_utils";
const { useState } = hooks;
import { Query, objectToQuery } from "../services/router";

declare const odoo: any;

export function makeLegacyActionManagerService(legacyEnv: any): Service<void> {
  // add a service to redirect 'do-action' events triggered on the bus in the
  // legacy env to the action-manager service in the wowl env
  return {
    name: "legacy_action_manager",
    dependencies: ["action_manager"],
    deploy(env: OdooEnv): void {
      legacyEnv.bus.on("do-action", null, (payload: any) => {
        const legacyOptions = payload.options || {};

        // use camelCase instead of snake_case for some keys
        Object.assign(legacyOptions, {
          additionalContext: legacyOptions.additional_context,
          clearBreadcrumbs: legacyOptions.clear_breadcrumbs,
          viewType: legacyOptions.view_type,
          resId: legacyOptions.res_id,
        });
        delete legacyOptions.additional_context;
        delete legacyOptions.clear_breadcrumbs;
        delete legacyOptions.view_type;
        delete legacyOptions.res_id;

        env.services.action_manager.doAction(payload.action, legacyOptions);
      });
    },
  };
}

export function makeLegacyRpcService(legacyEnv: any): Service<void> {
  return {
    name: "legacy_rpc",
    deploy(env: OdooEnv): void {
      legacyEnv.bus.on("rpc_request", null, (rpcId: number) => {
        env.bus.trigger("RPC:REQUEST", rpcId);
      });
      legacyEnv.bus.on("rpc_response", null, (rpcId: number) => {
        env.bus.trigger("RPC:RESPONSE", rpcId);
      });
      legacyEnv.bus.on("rpc_response_failed", null, (rpcId: number) => {
        env.bus.trigger("RPC:RESPONSE", rpcId);
      });
    },
  };
}

export function makeLegacySessionService(legacyEnv: any, session: any): Service<void> {
  return {
    name: "legacy_session",
    deploy(env: OdooEnv): void {
      // userContext
      const userContext = Object.create(env.services.user.context);
      legacyEnv.session.userContext = userContext;
      // usually core.session
      session.user_context = userContext;
    },
  };
}

export function mapLegacyEnvToWowlEnv(legacyEnv: any, wowlEnv: OdooEnv) {
  // rpc
  legacyEnv.session.rpc = (...args: any[]) => {
    let rejection;
    const prom = new Promise((resolve, reject) => {
      rejection = () => reject();
      const [route, params, settings] = args;
      wowlEnv.services.rpc(route, params, settings).then(resolve).catch(reject);
    });
    (prom as any).abort = rejection;
    return prom;
  };
  // Storages
  function mapStorage(storage: Storage) {
    return Object.assign(Object.create(storage), {
      getItem(key: string, defaultValue: any) {
        const val = storage.getItem(key);
        return val ? JSON.parse(val) : defaultValue;
      },
      setItem(key: string, value: any) {
        storage.setItem(key, JSON.stringify(value));
      },
    });
  }
  legacyEnv.services.local_storage = mapStorage(odoo.browser.localStorage);
  legacyEnv.services.session_storage = mapStorage(odoo.browser.sessionStorage);
  // map WebClientReady
  wowlEnv.bus.on("WEB_CLIENT_READY", null, () => {
    legacyEnv.bus.trigger("web_client_ready");
  });
}

interface ComponentAdapter extends Component {
  widget: any;
  _trigger_up(ev: any): void;
}

interface ActionAdapter extends ComponentAdapter {
  exportState(): any;
  canBeRemoved(): Promise<void>;
  getTitle(): string;
  documentState(): any;
}

odoo.define("wowl.ActionAdapters", function (require: any) {
  const {
    ComponentAdapter,
  }: { ComponentAdapter: Type<ComponentAdapter> } = require("web.OwlCompatibility");
  class ActionAdapter extends ComponentAdapter {
    am = useService("action_manager");
    router = useService("router");
    title = useService("title");

    // a legacy widget widget can push_state anytime including during its async rendering
    // In Wowl, we want to have all states pushed during the same setTimeout.
    // This is protected in legacy (backward compatibility) but should not e supported in Wowl
    tempQuery: Query | null = {};
    __widget: any;

    constructor(...args: any[]) {
      super(...args);
      const envWowl = <OdooEnv>this.env;
      hooks.onMounted(() => {
        this.title.setParts({ action: this.widget.getTitle() });
        const query = objectToQuery(this.widget.getState());
        Object.assign(query, this.tempQuery);
        this.tempQuery = null;
        this.router.pushState(query);
        this.__widget = this.widget;
        envWowl.bus.on("ACTION_MANAGER:UPDATE", this, (info: ActionManagerUpdateInfo) => {
          if (info.type === "MAIN") {
            (this.env as any).bus.trigger("close_dialogs");
          }
        });
      });
      hooks.onWillUnmount(() => {
        envWowl.bus.off("ACTION_MANAGER:UPDATE", this);
      });
    }

    _trigger_up(ev: any) {
      const payload = ev.data;
      if (ev.name === "do_action") {
        const actionContext = payload.action.context;
        // The context needs to be evaluated if it comes from the legacy compound context class.
        if (
          typeof actionContext == "object" &&
          actionContext.__ref &&
          actionContext.__ref === "compound_context"
        ) {
          payload.action.context = actionContext.eval();
        }
        this.am.doAction(payload.action);
      } else if (ev.name === "breadcrumb_clicked") {
        this.am.restore(payload.controllerID);
      } else if (ev.name === "push_state") {
        const query = objectToQuery(payload.state);
        if (this.tempQuery) {
          Object.assign(this.tempQuery, query);
          return;
        }
        this.router.pushState(query);
      } else {
        super._trigger_up(ev);
      }
    }

    /**
     * This function is called just before the component will be unmounted,
     * because it will be replaced by another one. However, we need to keep it
     * alive, because we might come back to this one later. We thus return the
     * widget instance, and set this.widget to null so that it is not destroyed
     * by the compatibility layer. That instance will be destroyed by the
     * ActionManager service when it will be removed from the controller stack,
     * and if we ever come back to that controller, the instance will be given
     * in props so that we can re-use it.
     */
    exportState() {
      this.widget = null;
      return { __legacy_widget__: this.__widget };
    }
    canBeRemoved() {
      return this.__widget.canBeRemoved();
    }
    getTitle() {
      return this.__widget.getTitle();
    }
  }

  class ClientActionAdapter extends ActionAdapter {
    constructor(parent: Component, props: any) {
      super(parent, props);
      const envWowl = <OdooEnv>this.env;
      useDebugManager((accessRights: DebuggingAccessRights) =>
        setupDebugAction(accessRights, envWowl, this.props.widgetArgs[0])
      );
      this.env = Component.env;
    }
    async willStart() {
      if (this.props.widget) {
        this.widget = this.props.widget;
        return this.updateWidget();
      }
      return super.willStart();
    }

    /**
     * @override
     */
    updateWidget() {
      return this.widget.do_show();
    }

    do_push_state() {}
  }

  const magicReloadSymbol = Symbol("magicReload");
  function useMagicLegacyReload<
    T extends ComponentAdapter = ComponentAdapter
  >(): { reloadProm: Promise<any> | null } {
    const comp: T = <T>Component.current;
    if (comp.props.widget && comp.props.widget[magicReloadSymbol]) {
      return comp.props.widget[magicReloadSymbol];
    }
    let legacyReloadProm: Promise<any> | null = null;
    const getters = {
      get reloadProm() {
        return legacyReloadProm;
      },
    };

    let manualReload: boolean;
    hooks.onMounted(() => {
      const widget = comp.widget;

      const controllerReload = widget.reload;
      widget.reload = function (...args: any[]) {
        manualReload = true;
        legacyReloadProm = <Promise<any>>controllerReload.call(widget, ...args);
        return legacyReloadProm.then(() => {
          if (manualReload) {
            legacyReloadProm = null;
            manualReload = false;
          }
        });
      };
      const controllerUpdate = widget.update;
      widget.update = function (...args: any[]) {
        const updateProm = controllerUpdate.call(widget, ...args);
        const manualUpdate = !manualReload;
        if (manualUpdate) {
          legacyReloadProm = updateProm;
        }
        return updateProm.then(() => {
          if (manualUpdate) {
            legacyReloadProm = null;
          }
        });
      };
      widget[magicReloadSymbol] = getters;
    });
    return getters;
  }

  class ViewAdapter extends ActionAdapter {
    model = useService("model");
    am = useService("action_manager");
    vm = useService("view_manager");
    widget: any;
    shouldUpdateWidget: boolean = true;
    magicReload = useMagicLegacyReload();
    constructor(...args: any[]) {
      super(...args);
      const envWowl = <OdooEnv>this.env;
      useDebugManager((accessRights: DebuggingAccessRights) =>
        setupDebugAction(accessRights, envWowl, this.props.viewParams.action)
      );
      useDebugManager((accessRights: DebuggingAccessRights) =>
        setupDebugView(accessRights, envWowl, this, this.props.viewParams.action)
      );
      if (this.props.viewInfo.type === "form") {
        useDebugManager((accessRights: DebuggingAccessRights) =>
          setupDebugViewForm(envWowl, this, this.props.viewParams.action)
        );
      }
      if (!(envWowl as any).inDialog) {
        hooks.onMounted(() => {
          envWowl.bus.on("ACTION_MANAGER:UPDATE", this, (info: ActionManagerUpdateInfo) => {
            switch (info.type) {
              case "OPEN_DIALOG": {
                // we are a main action, and a dialog is going to open:
                // we should not reload
                this.shouldUpdateWidget = false;
                break;
              }
              case "CLOSE_DIALOG": {
                this.shouldUpdateWidget = false;
                break;
              }
            }
          });
        });
      }
      this.env = <OdooEnv>Component.env;
    }
    async willStart() {
      if (this.props.widget) {
        this.widget = this.props.widget;
        return this.updateWidget(this.props.viewParams);
      } else {
        const view = new this.props.View(this.props.viewInfo, this.props.viewParams);
        this.widget = await view.getController(this);
        if (this.__owl__.isDestroyed) {
          // the component might have been destroyed meanwhile, but if so, `this.widget` wasn't
          // destroyed by OwlCompatibility layer as it wasn't set yet, so destroy it now
          this.widget.destroy();
          return Promise.resolve();
        }
        return this.widget._widgetRenderAndInsert(() => {});
      }
    }

    /**
     * @override
     */
    async updateWidget(nextProps: ViewProps) {
      const shouldUpdateWidget = this.shouldUpdateWidget;
      this.shouldUpdateWidget = true;
      if (!shouldUpdateWidget) {
        return;
      }
      await this.widget.willRestore();
      const options = Object.assign({}, this.props.viewParams, {
        shouldUpdateSearchComponents: true,
      });
      return this.widget.reload(options);
    }

    /**
     * Override to add the state of the legacy controller in the exported state.
     */
    exportState() {
      const widgetState = this.widget.exportState();
      const state = super.exportState();
      return Object.assign({}, state, widgetState);
    }

    async loadViews(model: string, context: Context, views: [ViewId, ViewType][]) {
      return (await this.vm.loadViews({ model, views, context }, {})).fields_views;
    }

    /**
     * @private
     * @param {OdooEvent} ev
     */
    async _trigger_up(ev: any) {
      const payload = ev.data;
      if (ev.name === "switch_view") {
        const state = ev.target.exportState();
        try {
          await this.am.switchView(payload.view_type, {
            recordId: payload.res_id,
            recordIds: state.resIds,
            searchModel: state.searchModel,
            searchPanel: state.searchPanel,
          });
        } catch (e) {
          if (e instanceof ViewNotFoundError) {
            return;
          }
          throw e;
        }
      } else if (ev.name === "execute_action") {
        this.am.doActionButton({
          args: payload.action_data.args,
          buttonContext: payload.action_data.context,
          close: payload.action_data.close,
          context: payload.env.context,
          model: payload.env.model,
          name: payload.action_data.name,
          recordId: payload.env.currentID || null,
          recordIds: payload.env.resIDs,
          special: payload.action_data.special,
          type: payload.action_data.type,
          onClose: payload.on_closed,
        });
      } else {
        super._trigger_up(ev);
      }
    }
  }

  return { ClientActionAdapter, ViewAdapter };
});

type LegacyBreadCrumbs = {title: string, controllerID: string}[];

function breadcrumbsToLegacy(breadcrumbs?: Breadcrumbs): LegacyBreadCrumbs|undefined {
  if (!breadcrumbs) {
    return;
  }
  return breadcrumbs.slice().map((bc) => {
    return { title: bc.name, controllerID: bc.jsId };
  });
}

odoo.define("wowl.legacyClientActions", function (require: any) {
  const { action_registry } = require("web.core");
  const { ClientActionAdapter } = require("wowl.ActionAdapters");
  const Widget = require("web.Widget");

  // registers an action from the legacy action registry to the wowl one, ensuring
  // that widget actions are actually Components
  function registerClientAction(name: string, action: any) {
    if ((action as any).prototype instanceof Widget) {
      // the action is a widget, wrap it into a Component and register that component
      class Action extends Component<ClientActionProps, OdooEnv> {
        static template = tags.xml`<ClientActionAdapter Component="Widget" widgetArgs="widgetArgs" widget="widget" t-ref="controller"/>`;
        static components = { ClientActionAdapter };

        controllerRef = hooks.useRef<ActionAdapter>("controller");

        Widget = action;
        widgetArgs = [this.props.action, {breadcrumbs: breadcrumbsToLegacy(this.props.breadcrumbs)}];
        widget = this.props.state && this.props.state.__legacy_widget__;

        constructor() {
          super(...arguments);
          useSetupAction({
            export: () => this.controllerRef.comp!.exportState(),
            getTitle: () => this.controllerRef.comp!.getTitle(),
          });
        }
      }
      actionRegistry.add(name, Action);
    } else {
      // the action is either a Component or a function, register it directly
      actionRegistry.add(name, action as any);
    }
  }

  // register action already in the legacy registry, and listens to future registrations
  for (const [name, action] of Object.entries(action_registry.entries())) {
    if (!actionRegistry.contains(name)) {
      registerClientAction(name, action);
    }
  }
  action_registry.onAdd(registerClientAction);
});

odoo.define("wowl.legacyViews", async function (require: any) {
  const legacyViewRegistry = require("web.view_registry");
  const { ViewAdapter } = require("wowl.ActionAdapters");
  const Widget = require("web.Widget");

  // registers a view from the legacy view registry to the wowl one, but wrapped
  // into an Owl Component
  function registerView(name: string, LegacyView: any) {
    class Controller extends Component<ViewProps, OdooEnv> {
      static template = tags.xml`
        <ViewAdapter Component="Widget" View="View" viewInfo="viewInfo" viewParams="viewParams" widget="widget" t-ref="controller"/>
      `;
      static components = { ViewAdapter };
      static display_name = LegacyView.prototype.display_name;
      static icon = LegacyView.prototype.icon;
      static multiRecord = LegacyView.prototype.multi_record;
      static type = LegacyView.prototype.viewType;
      static isLegacy = true;

      vm = useService("view_manager");
      controllerRef = hooks.useRef<ActionAdapter>("controller");

      Widget = Widget; // fool the ComponentAdapter with a simple Widget
      View = LegacyView;
      viewInfo: any = {};
      viewParams = {
        action: this.props.action,
        // legacy views automatically add the last part of the breadcrumbs
        breadcrumbs: breadcrumbsToLegacy(this.props.breadcrumbs),
        modelName: this.props.model,
        currentId: this.props.recordId,
        controllerState: {
          currentId: this.props.recordId || (this.props.state && this.props.state.currentId),
          resIds: this.props.recordIds || (this.props.state && this.props.state.resIds),
          searchModel: this.props.searchModel || (this.props.state && this.props.state.searchModel),
          searchPanel: this.props.searchPanel || (this.props.state && this.props.state.searchPanel),
        },
      };
      widget = this.props.state && this.props.state.__legacy_widget__;

      constructor() {
        super(...arguments);
        useSetupAction({
          beforeLeave: () => this.controllerRef.comp!.widget!.canBeRemoved(),
          export: () => this.controllerRef.comp!.exportState(),
          getTitle: () => this.controllerRef.comp!.getTitle(),
        });
      }

      async willStart() {
        const params = {
          model: this.props.model,
          views: this.props.views,
          context: this.props.context,
        };
        const options = {
          actionId: this.props.actionId,
          context: this.props.context,
          withActionMenus: this.props.withActionMenus,
          withFilters: this.props.withFilters,
        };
        const result: any = await this.vm.loadViews(params, options);
        const fieldsInfo = result.fields_views[this.props.type];
        this.viewInfo = Object.assign({}, fieldsInfo, {
          fields: result.fields,
          viewFields: fieldsInfo.fields,
        });
        let controlPanelFieldsView;
        if (result.fields_views.search) {
          controlPanelFieldsView = Object.assign({}, result.fields_views.search, {
            favoriteFilters: result.filters,
            fields: result.fields,
            viewFields: result.fields_views.search.fields,
          });
        }
        this.viewParams.action = Object.assign({}, this.viewParams.action, {
          controlPanelFieldsView,
          _views: this.viewParams.action.views,
          views: this.props.viewSwitcherEntries,
        });
      }
    }

    if (!viewRegistry.contains(name)) {
      viewRegistry.add(name, Controller);
    }
  }
  // register views already in the legacy registry, and listens to future registrations
  for (const [name, action] of Object.entries(legacyViewRegistry.entries())) {
    registerView(name, action);
  }
  legacyViewRegistry.onAdd(registerView);
});

export function setupDebugAction(
  accessRights: DebuggingAccessRights,
  env: OdooEnv,
  action: ClientAction | ActWindowActionAdapted
): MenuElement[] {
  const actionSeparator: MenuElement = {
    type: "separator",
    sequence: 100,
  };

  let description = env._t("Edit Action");
  const editAction: MenuElement = {
    type: "item",
    description: description,
    callback: () => {
      editModelDebug(env, description, action.type, action.id as number);
    },
    sequence: 110,
  };

  description = env._t("View Fields");
  const viewFields: MenuElement = {
    type: "item",
    description: description,
    callback: async () => {
      const modelId = (
        await env.services
          .model("ir.model")
          .search([["model", "=", action.res_model as string]], { limit: 1 })
      )[0];

      env.services.action_manager.doAction({
        res_model: "ir.model.fields",
        name: description,
        views: [
          [false, "list"],
          [false, "form"],
        ],
        domain: [["model_id", "=", modelId]],
        type: "ir.actions.act_window",
        context: {
          default_model_id: modelId,
        },
      });
    },
    sequence: 120,
  };

  description = env._t("Manage Filters");
  const manageFilters: MenuElement = {
    type: "item",
    description: description,
    callback: () => {
      // manage_filters
      env.services.action_manager.doAction({
        res_model: "ir.filters",
        name: description,
        views: [
          [false, "list"],
          [false, "form"],
        ],
        type: "ir.actions.act_window",
        context: {
          search_default_my_filters: true,
          search_default_model_id: action.res_model,
        },
      });
    },
    sequence: 130,
  };

  const technicalTranslation: MenuElement = {
    type: "item",
    description: env._t("Technical Translation"),
    callback: async () => {
      const result = await env.services
        .model("ir.translation")
        .call("get_technical_translations", [action.res_model]);
      env.services.action_manager.doAction(result);
    },
    sequence: 140,
  };

  const accessSeparator: MenuElement = {
    type: "separator",
    sequence: 200,
  };

  description = env._t("View Access Rights");
  const viewAccessRights: MenuElement = {
    type: "item",
    description: description,
    callback: async () => {
      const modelId = (
        await env.services
          .model("ir.model")
          .search([["model", "=", action.res_model as string]], { limit: 1 })
      )[0];

      env.services.action_manager.doAction({
        res_model: "ir.model.access",
        name: description,
        views: [
          [false, "list"],
          [false, "form"],
        ],
        domain: [["model_id", "=", modelId]],
        type: "ir.actions.act_window",
        context: {
          default_model_id: modelId,
        },
      });
    },
    sequence: 210,
  };

  description = env._t("Model Record Rules");
  const viewRecordRules: MenuElement = {
    type: "item",
    description: env._t("View Record Rules"),
    callback: async () => {
      const modelId = (
        await env.services
          .model("ir.model")
          .search([["model", "=", action.res_model as string]], { limit: 1 })
      )[0];
      env.services.action_manager.doAction({
        res_model: "ir.rule",
        name: description,
        views: [
          [false, "list"],
          [false, "form"],
        ],
        domain: [["model_id", "=", modelId]],
        type: "ir.actions.act_window",
        context: {
          default_model_id: modelId,
        },
      });
    },
    sequence: 220,
  };

  const result: MenuElement[] = [actionSeparator];
  if (action.id) {
    result.push(editAction);
  }
  if (action.res_model) {
    result.push(viewFields);
    result.push(manageFilters);
    result.push(technicalTranslation);

    if (accessRights.canSeeModelAccess || accessRights.canSeeRecordRules) {
      result.push(accessSeparator);
      if (accessRights.canSeeModelAccess) {
        result.push(viewAccessRights);
      }
      if (accessRights.canSeeRecordRules) {
        result.push(viewRecordRules);
      }
    }
  }

  return result;
}

interface ActWindowActionAdapted extends Omit<ActWindowAction, "views"> {
  _views: ActWindowAction["views"];
  views: {
    type: string;
    name: string;
  }[];
}

class FieldViewGetDialog extends Component<{}, OdooEnv> {
  static template = tags.xml`
  <Dialog title="title">
    <pre t-esc="props.arch"/>
  </Dialog>`;
  static components = { Dialog };
  title = this.env._t("Fields View Get");
}

interface GetMetadataProps {
  res_model: string;
  selectedIds: number[];
}
interface GetMetadataState {
  create_date: string;
  creator: string;
  noupdate: any;
  lastModifiedBy: string;
  id: number;
  write_date: string;
  xmlid: string;
}
class GetMetadataDialog extends Component<GetMetadataProps, OdooEnv> {
  static template = "wowl.DebugManager.GetMetadata";
  static components = { Dialog };
  title = this.env._t("View Metadata");
  state = useState({} as GetMetadataState);

  constructor(...args: any[]) {
    super(...args);
  }

  async willStart() {
    await this.getMetadata();
  }

  async toggleNoupdate() {
    await this.env.services
      .model("ir.model.data")
      .call("toggle_noupdate", [this.props.res_model, this.state.id]);
    await this.getMetadata();
  }

  async getMetadata() {
    const metadata = (
      await this.env.services
        .model(this.props.res_model)
        .call("get_metadata", [this.props.selectedIds])
    )[0];

    this.state.id = metadata.id;
    this.state.xmlid = metadata.xmlid;
    this.state.creator = formatMany2one(metadata.create_uid);
    this.state.lastModifiedBy = formatMany2one(metadata.write_uid);
    this.state.create_date = formatDateTime(
      parseDateTime(metadata.create_date, this.env),
      this.env
    );
    this.state.write_date = formatDateTime(parseDateTime(metadata.write_date, this.env), this.env);
    this.state.noupdate = metadata.noupdate;
  }
}

interface SetDefaultProps {
  component: ComponentAdapter;
  res_model: string;
}
class SetDefaultDialog extends Component<SetDefaultProps, OdooEnv> {
  static template = "wowl.DebugManager.SetDefault";
  static components = { Dialog };
  title = this.env._t("Set Default");
  state = {
    fieldToSet: "",
    condition: "",
    scope: "self",
  };
  dataWidgetState = this.getDataWidgetState();
  defaultFields = this.getDefaultFields();
  conditions = this.getConditions();

  getDataWidgetState() {
    const renderer = this.props.component.widget.renderer;
    const state = renderer.state;
    const fields = state.fields;
    const fieldsInfo = state.fieldsInfo.form;
    const fieldNamesInView = state.getFieldNames();
    const fieldNamesOnlyOnView: string[] = ["message_attachment_count"];
    const fieldsValues = state.data;
    const modifierDatas: {
      [id: string]: any;
    } = {};
    fieldNamesInView.forEach((fieldName: string) => {
      modifierDatas[fieldName] = renderer.allModifiersData.find((modifierdata: any) => {
        return modifierdata.node.attrs.name === fieldName;
      });
    });
    return {
      fields,
      fieldsInfo,
      fieldNamesInView,
      fieldNamesOnlyOnView,
      fieldsValues,
      modifierDatas,
      stateId: state.id,
    };
  }

  getDefaultFields() {
    const {
      fields,
      fieldsInfo,
      fieldNamesInView,
      fieldNamesOnlyOnView,
      fieldsValues,
      modifierDatas,
      stateId,
    } = this.dataWidgetState;

    return fieldNamesInView
      .filter((fieldName: string) => !fieldNamesOnlyOnView.includes(fieldName))
      .map((fieldName: string) => {
        const modifierData = modifierDatas[fieldName];
        let invisibleOrReadOnly;
        if (modifierData) {
          const evaluatedModifiers = modifierData.evaluatedModifiers[stateId];
          invisibleOrReadOnly = evaluatedModifiers.invisible || evaluatedModifiers.readonly;
        }
        const fieldInfo = fields[fieldName];
        const valueDisplayed = this.display(fieldInfo, fieldsValues[fieldName]);
        const value = valueDisplayed[0];
        const displayed = valueDisplayed[1];
        // ignore fields which are empty, invisible, readonly, o2m
        // or m2m
        if (
          !value ||
          invisibleOrReadOnly ||
          fieldInfo.type === "one2many" ||
          fieldInfo.type === "many2many" ||
          fieldInfo.type === "binary" ||
          fieldsInfo[fieldName].options.isPassword ||
          fieldInfo.depends.length !== 0
        ) {
          return false;
        }
        return {
          name: fieldName,
          string: fieldInfo.string,
          value: value,
          displayed: displayed,
        };
      })
      .filter((val: any) => val)
      .sort((field: any) => field.string);
  }

  getConditions() {
    const { fields, fieldNamesInView, fieldsValues } = this.dataWidgetState;

    return fieldNamesInView
      .filter((fieldName: any) => {
        const fieldInfo = fields[fieldName];
        return fieldInfo.change_default;
      })
      .map((fieldName: any) => {
        const fieldInfo = fields[fieldName];
        const valueDisplayed = this.display(fieldInfo, fieldsValues[fieldName]);
        const value = valueDisplayed[0];
        const displayed = valueDisplayed[1];
        return {
          name: fieldName,
          string: fieldInfo.string,
          value: value,
          displayed: displayed,
        };
      });
  }

  display(fieldInfo: any, value: any) {
    let displayed = value;
    if (value && fieldInfo.type === "many2one") {
      displayed = value.data.display_name;
      value = value.data.id;
    } else if (value && fieldInfo.type === "selection") {
      displayed = fieldInfo.selection.find((option: any) => {
        return option[0] === value;
      })[1];
    }
    return [value, displayed];
  }

  async saveDefault() {
    if (!this.state.fieldToSet) {
      // TODO $defaults.parent().addClass('o_form_invalid');
      // It doesn't work in web.
      // Good solution: Create a FormView
      return;
    }
    const fieldToSet = this.defaultFields.find((field: any) => {
      return field.name === this.state.fieldToSet;
    }).value;
    await this.env.services
      .model("ir.default")
      .call("set", [
        this.props.res_model,
        this.state.fieldToSet,
        fieldToSet,
        this.state.scope === "self",
        true,
        this.state.condition || false,
      ]);
    this.trigger("dialog-closed");
  }
}

export function setupDebugView(
  accessRights: DebuggingAccessRights,
  env: OdooEnv,
  component: ComponentAdapter,
  action: ActWindowActionAdapted
): MenuElement[] {
  const viewId = component.props.viewInfo.view_id;

  const viewSeparator: MenuElement = {
    type: "separator",
    sequence: 300,
  };

  const fieldsViewGet: MenuElement = {
    type: "item",
    description: env._t("Fields View Get"),
    callback: () => {
      const props = {
        arch: json_node_to_xml(component.widget.renderer.arch, true, 0),
      };
      env.services.dialog_manager.open(FieldViewGetDialog, props);
    },
    sequence: 340,
  };

  const displayName = action
    .views!.find((v) => v.type === component.widget.viewType)!
    .name.toString();
  let description = env._t("Edit View: ") + displayName;
  const editView: MenuElement = {
    type: "item",
    description: description,
    callback: () => {
      editModelDebug(env, description, "ir.ui.view", viewId);
    },
    sequence: 350,
  };

  description = env._t("Edit ControlPanelView");
  const editControlPanelView: MenuElement = {
    type: "item",
    description: description,
    callback: () => {
      editModelDebug(
        env,
        description,
        "ir.ui.view",
        component.props.viewParams.action.controlPanelFieldsView.view_id
      );
    },
    sequence: 360,
  };

  const result = [viewSeparator, fieldsViewGet];
  if (accessRights.canEditView) {
    result.push(editView);
    result.push(editControlPanelView);
  }

  return result;
}

export function setupDebugViewForm(
  env: OdooEnv,
  component: ComponentAdapter,
  action: ActWindowActionAdapted
): MenuElement[] {
  const setDefaults: MenuElement = {
    type: "item",
    description: env._t("Set Defaults"),
    callback: () => {
      env.services.dialog_manager.open(SetDefaultDialog, {
        res_model: action.res_model,
        component: component,
      });
    },
    sequence: 310,
  };

  const viewMetadata: MenuElement = {
    type: "item",
    description: env._t("View Metadata"),
    callback: () => {
      const selectedIds = component.widget.getSelectedIds();
      env.services.dialog_manager.open(GetMetadataDialog, {
        res_model: action.res_model,
        selectedIds,
      });
    },
    sequence: 320,
  };

  const description = env._t("Manage Attachments");
  const manageAttachments: MenuElement = {
    type: "item",
    description: description,
    callback: () => {
      const selectedId = component.widget.getSelectedIds()[0];
      env.services.action_manager.doAction({
        res_model: "ir.attachment",
        name: description,
        views: [
          [false, "list"],
          [false, "form"],
        ],
        type: "ir.actions.act_window",
        domain: [
          ["res_model", "=", action.res_model],
          ["res_id", "=", selectedId],
        ],
        context: {
          default_res_model: action.res_model,
          default_res_id: selectedId,
        },
      });
    },
    sequence: 330,
  };

  const result = [setDefaults];
  if (component.widget.getSelectedIds().length === 1) {
    result.push(viewMetadata);
    result.push(manageAttachments);
  }

  return result;
}
