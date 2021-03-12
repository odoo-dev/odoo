/** @odoo-module **/
import { serviceRegistry } from "@wowl/webclient/service_registry";

const { core } = owl;

const URL_VIEW_KEY = "_view_type";
const URL_ACTION_KEY = "_action";
const URL_TAB_KEY = "_tab";
const URL_MODE_KEY = "mode";

export const MODES = {
  EDITOR: "editor",
  HOME_MENU: "home_menu",
  APP_CREATOR: "app_creator",
};

export class NotEditableActionError extends Error {
  constructor() {
    super(...arguments);
    this.name = "NotEditableActionError";
  }
}

function studioContext(context, on=true) {
  if (on) {
    context.studio = 1;
  } else {
    delete context.studio;
  }
}

export const studioService = {
  name: "studio",
  dependencies: ["action", "home_menu", "router", 'user'],
  async deploy(env) {
    function _getCurrentAction() {
      const currentController = env.services.action.currentController;
      return currentController ? currentController.action : null;
    }

    function _isStudioEditable(action) {
      if (action.type === "ir.actions.client") {
        // home_menu is somehow customizable (app creator)
        return action.tag === "menu" ? true : false;
      }
      if (action.type === "ir.actions.act_window" && action.xml_id) {
        if (action.res_model.indexOf("settings") > -1) {
          return false; // settings views aren't editable
        }
        if (action.res_model.indexOf("x_") === 0) {
          return false; // custom models aren't editable
        }
        if (action.res_model === "board.board") {
          return false; // dashboard isn't editable
        }
        return action.res_model ? true : false;
      }
      return false;
    }

    const bus = new core.EventBus();
    let inStudio = false;

    const state = {
      studioMode: null,
      editedViewType: null,
      editedAction: null,
      editedControllerState: null,
      editorTab: "views",
      // editedReport: null,
    };

    async function _loadParamsFromURL() {
      const currentHash = env.services.router.current.hash;
      studioContext(env.services.user.context, false);
      if (currentHash.action === "studio") {
        studioContext(env.services.user.context, true);
        state.studioMode = currentHash[URL_MODE_KEY];
        state.editedViewType = currentHash[URL_VIEW_KEY] || null;
        state.editorTab = currentHash[URL_TAB_KEY] || null;

        const editedActionId = currentHash[URL_ACTION_KEY];
        if (state.studioMode === MODES.EDITOR) {
          if (editedActionId) {
            state.editedAction = await env.services.action.loadAction(editedActionId);
          } else {
            state.editedAction = null;
          }
        }
        if (!state.editedAction || !_isStudioEditable(state.editedAction)) {
          state.studioMode = state.studioMode || MODES.HOME_MENU;
          state.editedAction = null;
          state.editedViewType = null;
          state.editorTab = null;
        }
      }
    }

    let studioProm = _loadParamsFromURL();
    env.bus.on("ROUTE_CHANGE", null, async () => {
      studioProm = _loadParamsFromURL();
    });

    async function _openStudio(targetMode, action = false, viewType = false) {
      if (!targetMode) {
        throw new Error("mode is mandatory");
      }

      const options = {};
      // clearBreadcrumbs: true, TODO
      if (targetMode === MODES.EDITOR) {
        let controllerState;
        if (!action) {
          // systray open
          const currentController = env.services.action.currentController;
          if (currentController) {
            env.bus.trigger('ACTION_MANAGER:EXPORT_CONTROLLER_STATE');
            action = currentController.action;
            viewType = currentController.view.type;
            controllerState = currentController.exportedState;
          }
        }
        if (!_isStudioEditable(action)) {
          throw new NotEditableActionError();
        }
        if (action !== state.editedAction) {
          options.clearBreadcrumbs = true;
        }
        state.editedAction = action;
        state.editedViewType = viewType || action.views[0][1]; // fallback on first view of action
        state.editorTab = "views";
        state.editedControllerState = controllerState || {};
      }
      if (inStudio) {
        options.stackPosition = "replaceCurrentAction";
      }
      state.studioMode = targetMode;
      studioContext(env.services.user.context, true);
      // LPE: we don't manage errors during do action.....
      return env.services.action.doAction("studio", options);
    }

    async function open(mode = false, actionId = false) {
      if (!mode && inStudio) {
        throw new Error("can't already be in studio");
      }
      if (!mode) {
        mode = env.services.home_menu.hasHomeMenu ? MODES.HOME_MENU : MODES.EDITOR;
      }
      let action;
      if (actionId) {
        action = await env.services.action.loadAction(actionId);
      }
      return _openStudio(mode, action);
    }

    async function leave() {
      // LPE challenge me: in normal mode: in list, open record
      // open studio
      // toggle appCreator
      // leave studio
      // With this implem, the homeMenu is displayed without the background action
      // if we did have the background action, we would need to update the action in place in the controllers
      // Which is relatively not easy
      if (!inStudio) {
        throw new Error("leave when not in studio???");
      }
      env.bus.trigger('CLEAR-CACHES');
      const options = {
        stackPosition: "replacePreviousAction", // If target is menu, then replaceCurrent, see comment above why we cannot do this
      };
      let actionId;
      if (state.studioMode === MODES.EDITOR) {
        actionId = state.editedAction.id;
        options.additionalContext = state.editedAction.context;
        options.viewType = state.editedViewType;
        if (state.editedControllerState) {
          options.resId = state.editedControllerState.currentId;
        }
      } else {
        actionId = "menu";
      }
      studioContext(env.services.user.context, false);
      await env.services.action.doAction(actionId, options);
      state.studioMode = null;
    }

    function toggleHomeMenu() {
      if (!inStudio) {
        throw new Error("is it possible?");
      }
      let targetMode;
      if (state.studioMode === MODES.APP_CREATOR || state.studioMode === MODES.EDITOR) {
        targetMode = MODES.HOME_MENU;
      } else {
        targetMode = MODES.EDITOR;
      }
      const action = targetMode === MODES.EDITOR ? state.editedAction : null;
      if (targetMode === MODES.EDITOR && !action) {
        throw new Error("this button should not be clickable/visible");
      }
      const viewType = targetMode === MODES.EDITOR ? state.editedViewType : null;
      return _openStudio(targetMode, action, viewType);
    }

    function pushState() {
      const hash = { action: "studio" };
      hash[URL_MODE_KEY] = state.studioMode;
      hash[URL_ACTION_KEY] = undefined;
      hash[URL_VIEW_KEY] = undefined;
      hash[URL_TAB_KEY] = undefined;
      if (state.studioMode === MODES.EDITOR) {
        hash[URL_ACTION_KEY] = JSON.stringify(state.editedAction.id);
        hash[URL_VIEW_KEY] = state.editedViewType || undefined;
        hash[URL_TAB_KEY] = state.editorTab;
      }
      env.services.router.pushState(hash, true);
    }

    function setParams(params) {
      if ("mode" in params) {
        state.studioMode = params.mode;
      }
      if ("viewType" in params) {
        state.editedViewType = params.viewType || null;
      }
      if ("action" in params) {
        state.editedAction = params.action || null;
      }
      if ("editorTab" in params) {
        state.editorTab = params.editorTab;
        if (!('viewType' in params)) { // clean me
          state.editedViewType = null;
        }
        if (state.editorTab !== 'reports') {
          state.editedReport = null;
        } else if ('editedReport' in params) {
          state.editedReport = params.editedReport;
        }
      }
      bus.trigger("UPDATE");
    }

    env.bus.on("ACTION_MANAGER:UI-UPDATED", null, (mode) => {
      if (mode === "new") {
        return;
      }
      const action = _getCurrentAction();
      inStudio = action.tag === "studio";
    });

    return {
      MODES,
      bus,
      isStudioEditable() {
        const action = _getCurrentAction();
        return action ? _isStudioEditable(action) : false;
      },
      open,
      pushState,
      leave,
      toggleHomeMenu,
      setParams,
      get ready() {
        return studioProm;
      },
      get mode() {
        return state.studioMode;
      },
      get editedAction() {
        return state.editedAction;
      },
      get editedViewType() {
        return state.editedViewType;
      },
      get editedControllerState() {
        return state.editedControllerState;
      },
      get editedReport() {
        return state.editedReport;
      },
      get editorTab() {
        return state.editorTab;
      },
    };
  },
};

serviceRegistry.add(studioService.name, studioService);
