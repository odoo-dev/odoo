import { useSubEnv, useEnv } from "@web/owl2/utils";
import { _t } from "@web/core/l10n/translation";
import { browser } from "@web/core/browser/browser";
import { makeContext } from "@web/core/context";
import { useDebugCategory } from "@web/core/debug/debug_context";
import { evaluateExpr } from "@web/core/py_js/py";
import { rpc, rpcBus } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import { services } from "@web/core/services";
import { user } from "@web/core/user";
import { KeepLast } from "@web/core/utils/concurrency";
import { useBus, useService } from "@web/core/utils/hooks";
import { View, ViewNotFoundError } from "@web/views/view";
import { ActionDialog } from "./action_dialog";
import { ReportAction } from "./reports/report_action";
import { UPDATE_METHODS } from "@web/core/orm_plugin";
import { CallbackRecorder } from "@web/search/action_hook";
import { ControlPanel } from "@web/search/control_panel/control_panel";
import { PATH_KEYS, router as _router } from "@web/core/browser/router";
import { OfflinePlugin } from "@web/core/offline/offline_plugin";
import { GlobalBusPlugin } from "@web/core/global_bus_plugin";
import { DialogPlugin } from "@web/core/dialog/dialog_plugin";
import { EffectPlugin } from "@web/core/effects/effect_plugin";
import { NotificationPlugin } from "@web/core/notifications/notification_plugin";
import { TitlePlugin } from "@web/core/browser/title_plugin";
import { UIPlugin } from "@web/core/ui/ui_plugin";

import {
    Component,
    EventBus,
    markup,
    onError,
    onMounted,
    onWillUnmount,
    Plugin,
    usePlugin,
    useConfig,
    proxy,
    status,
    t,
    useProps,
    xml,
    useScope,
} from "@odoo/owl";
import { downloadReport, getReportUrl } from "./reports/utils";
import { zip } from "@web/core/utils/arrays";
import { isHtmlEmpty } from "@web/core/utils/html";
import { omit, pick, shallowEqual } from "@web/core/utils/objects";
import { session } from "@web/session";
import { exprToBoolean } from "@web/core/utils/strings";
import { DebugModePlugin } from "@web/core/debug_mode_plugin";

class BlankComponent extends Component {
    props = useProps({
        onMounted: t.any(),
        withControlPanel: t.any(),
    });
    static template = "web.BlankComponent";
    static components = { ControlPanel };

    setup() {
        this.uiService = useService("ui");
        useSubEnv({ config: { breadcrumbs: [], noBreadcrumbs: true } });
        onMounted(() => this.props.onMounted());
    }
}

const actionHandlersRegistry = registry.category("action_handlers");
const actionRegistry = registry.category("actions");

/** @typedef {number|false} ActionId */
/** @typedef {Object} ActionDescription */
/** @typedef {"current" | "fullscreen" | "new" | "main" | "self"} ActionMode */
/** @typedef {string} ActionTag */
/** @typedef {Object} Context */
/** @typedef {Function} CallableFunction */
/** @typedef {string} ViewType */

/** @typedef {ActionId|ActionXMLId|ActionTag|ActionDescription} ActionRequest */

/**
 * @typedef {Object} ActionOptions
 * @property {Context} [additionalContext]
 * @property {boolean} [clearBreadcrumbs]
 * @property {CallableFunction} [onClose]
 * @property {Object} [props]
 * @property {ViewType} [viewType]
 * @property {"replaceCurrentAction" | "replacePreviousAction"} [stackPosition]
 * @property {number} [index]
 * @property {boolean} [newWindow]
 * @property {boolean} [forceLeave]
 */

export async function clearUncommittedChanges(bus, { forceLeave } = {}) {
    const callbacks = [];
    bus.trigger("CLEAR-UNCOMMITTED-CHANGES", callbacks);
    const res = await Promise.all(callbacks.map((fn) => fn({ forceLeave })));
    return !res.includes(false);
}

export const standardActionServiceProps = {
    action: t.object(), // prop added by _getActionInfo
    actionId: t.number().optional(), // prop added by _getActionInfo
    className: t.string().optional(), // prop added by the ActionContainer
    globalState: t.object().optional(), // prop added by _updateUI
    state: t.object().optional(), // prop added by _updateUI
    resId: t.or([t.number(), t.boolean()]).optional(),
    updateActionState: t.function().optional(),
};

function parseActiveIds(ids) {
    const activeIds = [];
    if (typeof ids === "string") {
        activeIds.push(...ids.split(",").map(Number));
    } else if (typeof ids === "number") {
        activeIds.push(ids);
    }
    return activeIds;
}

const DIALOG_SIZES = {
    "extra-large": "xl",
    large: "lg",
    medium: "md",
    small: "sm",
};

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class ControllerNotFoundError extends Error {}

export class InvalidButtonParamsError extends Error {}

// -----------------------------------------------------------------------------
// ActionManagerPlugin
// -----------------------------------------------------------------------------

// regex that matches context keys not to forward from an action to another
const CTX_KEY_REGEX =
    /^(?:(?:default_|search_default_|show_).+|.+_view_ref|group_by|active_id|active_ids|orderedBy)$/;
// keys added to the context for the embedded actions feature
const EMBEDDED_ACTIONS_CTX_KEYS = [
    "current_embedded_action_id",
    "parent_action_embedded_actions",
    "parent_action_id",
    "from_embedded_action",
];

// only register this template once for all dynamic classes ControllerComponent
const ControllerComponentTemplate = xml`<t t-component="this.Component" t-props="this.componentProps"/>`;

export class ActionManagerPlugin extends Plugin {
    env = useEnv();
    router = _router;
    scope = useScope();
    debugMode = usePlugin(DebugModePlugin);
    offlinePlugin = usePlugin(OfflinePlugin);
    bus = useConfig(
        "bus",
        t.instanceOf(EventBus).optional(() => usePlugin(GlobalBusPlugin).bus)
    );
    dialogService = usePlugin(DialogPlugin);
    effectService = usePlugin(EffectPlugin);
    notification = usePlugin(NotificationPlugin);
    title = usePlugin(TitlePlugin);
    ui = usePlugin(UIPlugin);

    breadcrumbCache = {};
    keepLast = new KeepLast();
    id = 0;
    controllerStack = [];
    dialog = null;
    nextDialog = null;

    setup() {
        this.router.hideKeyFromUrl("globalState");

        rpcBus.addEventListener("RPC:RESPONSE", async (ev) => {
            const { model, method } = ev.detail.data.params;
            if (
                model === "ir.actions.act_window" &&
                UPDATE_METHODS.includes(method) &&
                !ev.detail.error
            ) {
                rpcBus.trigger("CLEAR-CACHES", "/web/action/load");
                const virtualStack = await this._controllersFromState(this.router.current);
                const nextStack = [
                    ...virtualStack,
                    this.controllerStack[this.controllerStack.length - 1],
                ];
                nextStack[nextStack.length - 1].config.breadcrumbs.splice(
                    0,
                    nextStack[nextStack.length - 1].config.breadcrumbs.length,
                    ...this._getBreadcrumbs(nextStack)
                );
                this.controllerStack = nextStack;
            }
        });
    }

    // ---------------------------------------------------------------------------
    // misc
    // ---------------------------------------------------------------------------

    /**
     * Create an array of virtual controllers based on the given state.
     *
     * @private
     * @param {object} state
     * @returns {Promise<object[]>} an array of virtual controllers
     */
    async _controllersFromState(state) {
        const currentState = JSON.parse(browser.sessionStorage.getItem("current_state") || "{}");
        if (this.router.stateToUrl(currentState) === this.router.stateToUrl(state)) {
            state = currentState;
        }
        if (!state?.actionStack?.length) {
            return [];
        }
        // The last controller will be created by doAction and won't be virtual
        const controllers = state.actionStack
            .slice(0, -1)
            .map((actionState, index) => {
                const controller = this._makeController({
                    displayName: actionState.displayName,
                    virtual: true,
                    action: {},
                    props: {},
                    state: { ...actionState, actionStack: state.actionStack.slice(0, index + 1) },
                    currentState: {},
                });
                if (actionState.action) {
                    controller.action.id = actionState.action;

                    const [actionRequestKey, clientAction] = actionRegistry.contains(
                        actionState.action
                    )
                        ? [actionState.action, actionRegistry.get(actionState.action)]
                        : actionRegistry
                              .getEntries()
                              .find((a) => a[1].path === actionState.action) ?? [];
                    if (actionRequestKey && clientAction) {
                        if (state.actionStack[index + 1]?.action === actionState.action) {
                            // client actions don't have multi-record views, so we can't go further to the next controller
                            return;
                        }
                        controller.action.tag = actionRequestKey;
                        controller.action.type = "ir.actions.client";
                        controller.displayName = clientAction.displayName?.toString();
                    }
                    if (actionState.active_id) {
                        controller.action.context = { active_id: actionState.active_id };
                        controller.currentState.active_id = actionState.active_id;
                    }
                }
                if (actionState.model) {
                    controller.action.type = "ir.actions.act_window";
                    controller.props.resModel = actionState.model;
                }
                if (actionState.resId) {
                    controller.action.type ||= "ir.actions.act_window";
                    controller.props.resId = actionState.resId;
                    controller.currentState.resId = actionState.resId;
                    controller.props.type = "form";
                }
                return controller;
            })
            .filter(Boolean);

        if (state.action && state.resId && controllers.at(-1)?.action?.id === state.action) {
            // When loading the state on a form view, we will need to load the action for it,
            // and this will give us the display name of the corresponding multi-record view in
            // the breadcrumb.
            // By marking the last controller as a lazyController, we can in some cases avoid
            // _loadBreadcrumbs from doing any network request as the breadcrumbs may only contain
            // the form view and the multi-record view.
            const bcControllers = await this._loadBreadcrumbs(controllers.slice(0, -1));
            controllers.at(-1).lazy = true;
            return [...bcControllers, controllers.at(-1)];
        }
        return this._loadBreadcrumbs(controllers);
    }

    /**
     * Load breadcrumbs for an array of controllers. This function adds display
     * names to controllers that the current user has access to and for which
     * the view (and record) exist. Controllers that correspond to a deleted
     * record or a record/view that the user can't access are removed.
     *
     * @private
     * @param {object[]} controllers an array of controllers whose breadcrumbs
     *  should be loaded
     * @returns {Promise<object[]>} a new array of the displayable controllers
     *  to which a display name was added
     */
    async _loadBreadcrumbs(controllers) {
        const toFetch = [];
        const keys = [];
        for (const { action, state, displayName } of controllers) {
            if (action.id === "menu" || (action.type === "ir.actions.client" && !displayName)) {
                continue;
            }
            const actionInfo = pick(state, "action", "model", "resId");
            const key = JSON.stringify(actionInfo);
            keys.push(key);
            if (displayName) {
                this.breadcrumbCache[key] = { display_name: displayName };
            }
            if (key in this.breadcrumbCache) {
                continue;
            }
            toFetch.push(actionInfo);
        }
        if (toFetch.length) {
            const req = rpc("/web/action/load_breadcrumbs", { actions: toFetch });
            for (const [i, info] of toFetch.entries()) {
                const key = JSON.stringify(info);
                this.breadcrumbCache[key] = req.then((res) => {
                    this.breadcrumbCache[key] = res[i];
                    return res[i];
                });
            }
        }
        const results = await Promise.all(keys.map((k) => this.breadcrumbCache[k]));
        const controllersToRemove = [];
        for (const [controller, res] of zip(controllers, results)) {
            if ("display_name" in res) {
                controller.displayName = res.display_name;
            } else {
                controllersToRemove.push(controller);
                if ("error" in res) {
                    console.warn(
                        "The following element was removed from the breadcrumb and from the url.\n",
                        controller.state,
                        "\nThis could be because the action wasn't found or because the user doesn't have the right to access to the record, the original error is :\n",
                        res.error
                    );
                }
            }
        }
        return controllers.filter((c) => !controllersToRemove.includes(c));
    }

    /**
     * Removes the current dialog from the action service's state.
     * It returns the dialog's onClose callback to be able to propagate it to the next dialog.
     *
     * @private
     * @return {Function|undefined} When there was a dialog, returns its onClose callback for propagation to next dialog.
     */
    async _removeDialog(closeParams) {
        if (this.dialog) {
            const { onClose, remove } = this.dialog;
            await onClose?.(closeParams);
            this.dialog = null;
            // Remove the dialog from the dialog_plugin.
            // The code is well enough designed to avoid falling in a function call loop.
            remove();
        }
    }

    /**
     * Returns the last controller of the current controller stack.
     *
     * @private
     * @returns {Controller|null}
     */
    _getCurrentController() {
        const stack = this.controllerStack;
        return stack.length ? stack[stack.length - 1] : null;
    }

    /**
     * Returns the current action, which is the action of the last controller in the stack.
     *
     * @private
     * @returns {Action|null}
     */
    async _getCurrentAction() {
        const currentController = this._getCurrentController();
        let action = null;
        if (currentController) {
            if (currentController.virtual) {
                try {
                    action = await this._loadAction(currentController.action.id);
                } catch (error) {
                    if (
                        error.exceptionName ===
                        "odoo.addons.web.controllers.action.MissingActionError"
                    ) {
                        action = null;
                    } else {
                        throw error;
                    }
                }
            } else {
                action = JSON.parse(currentController.action._originalAction);
            }
        }
        return action;
    }

    /**
     * Given an id, xmlid, tag (key of the client action registry) or directly an
     * object describing an action.
     *
     * @private
     * @param {ActionRequest} actionRequest
     * @param {Context} [context={}]
     * @returns {Promise<Action>}
     */
    async _loadAction(actionRequest, context = {}) {
        if (typeof actionRequest === "string" && actionRegistry.contains(actionRequest)) {
            // actionRequest is a key in the actionRegistry
            return {
                target: "current",
                tag: actionRequest,
                type: "ir.actions.client",
            };
        }

        if (typeof actionRequest === "string" || typeof actionRequest === "number") {
            // actionRequest is an id or an xmlid
            const ctx = makeContext([user.context, context]);
            delete ctx.params;
            const action = await rpc(
                "/web/action/load",
                {
                    action_id: actionRequest,
                    context: ctx,
                },
                { cache: { type: "disk" } }
            );
            if (action.help) {
                action.help = markup(action.help);
            }
            return Object.assign({}, action);
        }

        // actionRequest is an object describing the action
        return actionRequest;
    }

    /**
     * Makes a controller from the given params.
     *
     * @private
     * @param {Object} params
     * @returns {Controller}
     */
    _makeController(params) {
        return {
            ...params,
            jsId: `controller_${++this.id}`,
            isMounted: false,
        };
    }

    /**
     * this function returns an action description
     * with a unique jsId.
     *
     * @private
     */
    _preprocessAction(action, context = {}) {
        try {
            delete action._originalAction;
            action._originalAction = JSON.stringify(action);
        } catch {
            // do nothing, the action might simply not be serializable
        }
        action.context = makeContext([context, action.context], user.context);
        const domain = action.domain || [];
        action.domain =
            typeof domain === "string"
                ? evaluateExpr(domain, Object.assign({}, user.context, action.context))
                : domain;
        if (action.help) {
            if (isHtmlEmpty(action.help)) {
                delete action.help;
            }
        }
        action = { ...action }; // manipulate a copy to keep cached action unmodified
        action.jsId = `action_${++this.id}`;
        if (action.type === "ir.actions.act_window" || action.type === "ir.actions.client") {
            action.target = action.target || "current";
        }
        if (action.type === "ir.actions.act_window") {
            action.views = [...action.views.map((v) => [v[0], v[1]])]; // manipulate a copy to keep cached action unmodified
            action.controllers = {};
            if (action.views.every((v) => ["form", "search"].includes(v[1]))) {
                action.views = action.views.filter((v) => v[1] === "form");
            } else {
                const searchViewId = action.search_view_id ? action.search_view_id[0] : false;
                action.views.push([searchViewId, "search"]);
            }
            if ("no_breadcrumbs" in action.context) {
                action._noBreadcrumbs = action.context.no_breadcrumbs;
                delete action.context.no_breadcrumbs;
            }
        }
        return action;
    }

    /**
     * @private
     * @param {string} viewType
     * @throws {Error} if the current controller is not a view
     * @returns {View | null}
     */
    _getView(viewType) {
        const currentController = this.controllerStack[this.controllerStack.length - 1];
        if (currentController.action.type !== "ir.actions.act_window") {
            throw new Error(`switchView called but the current controller isn't a view`);
        }
        const view = currentController.views.find((view) => view.type === viewType);
        return view || null;
    }

    /**
     * Given a controller stack, returns the list of breadcrumb items.
     *
     * @private
     * @param {ControllerStack} stack
     * @returns {Breadcrumbs}
     */
    _getBreadcrumbs(stack) {
        const manager = this;
        return stack
            .filter((controller) => controller.action.tag !== "menu")
            .map((controller) => ({
                jsId: controller.jsId,
                get name() {
                    return controller.displayName;
                },
                get isFormView() {
                    return controller.props?.type === "form";
                },
                get url() {
                    const state = controller.state;
                    const mode = manager.debugMode.toString();
                    if (mode) {
                        state.debug = mode;
                    }
                    return manager.router.stateToUrl(state);
                },
                onSelected() {
                    manager.restore(controller.jsId);
                },
            }));
    }

    /**
     * @private
     * @param {object} state the state from which to get the action params
     * @returns {{ actionRequest: object, options: object} | null}
     */
    _getActionParams(state) {
        const options = {};
        let actionRequest = null;
        const storedAction = browser.sessionStorage.getItem("current_action");
        const lastAction = JSON.parse(storedAction || "{}");
        // If this method is called because of a company switch, the
        // stored allowed_company_ids is incorrect.
        delete lastAction.context?.allowed_company_ids;
        if (lastAction.help) {
            lastAction.help = markup(lastAction.help);
        }
        if (state.action) {
            const context = {};
            if (state.active_id) {
                context.active_id = state.active_id;
            }
            if (state.active_ids) {
                context.active_ids = parseActiveIds(state.active_ids);
            } else if (state.active_id) {
                context.active_ids = [state.active_id];
            }
            // ClientAction
            const [actionRequestKey, clientAction] = actionRegistry.contains(state.action)
                ? [state.action, actionRegistry.get(state.action)]
                : actionRegistry.getEntries().find((a) => a[1].path === state.action) ?? [];
            if (actionRequestKey && clientAction) {
                actionRequest = {
                    context,
                    params: state,
                    tag: actionRequestKey,
                    type: "ir.actions.client",
                };
                if (clientAction.path) {
                    actionRequest.path = clientAction.path;
                }
            } else {
                // The action to load isn't the current one => executes it
                Object.assign(options, {
                    additionalContext: context,
                    viewType: state.resId ? "form" : state.view_type,
                });
                if (
                    [lastAction.id, lastAction.path, lastAction.xml_id]
                        .filter(Boolean)
                        .includes(state.action) &&
                    (!lastAction.context?.active_id ||
                        lastAction.context?.active_id === context.active_id) &&
                    (!lastAction.context?.active_ids ||
                        shallowEqual(lastAction.context?.active_ids, context.active_ids)) &&
                    !lastAction.embedded_action_ids?.length
                ) {
                    actionRequest = lastAction;
                } else {
                    actionRequest = state.action;
                }
            }
            if ((state.resId && state.resId !== "new") || state.globalState) {
                options.props = {};
                if (state.resId && state.resId !== "new") {
                    options.props.resId = state.resId;
                }
                if (state.globalState) {
                    options.props.globalState = state.globalState;
                }
            }
        } else if (state.model) {
            if (state.resId || state.view_type === "form") {
                if (!lastAction.id && lastAction.res_model === state.model) {
                    actionRequest = lastAction;
                    options.props = { resId: state.resId === "new" ? undefined : state.resId };
                    if (state.view_id) {
                        actionRequest.views = [[state.view_id, "form"]];
                    }
                    options.viewType = "form";
                } else {
                    actionRequest = {
                        res_model: state.model,
                        res_id: state.resId === "new" ? undefined : state.resId,
                        type: "ir.actions.act_window",
                        views: [[state.view_id ? state.view_id : false, "form"]],
                    };
                }
            } else {
                // This is a window action on a multi-record view => restores it from
                // the session storage
                if (lastAction.res_model === state.model) {
                    actionRequest = lastAction;
                    options.viewType = state.view_type;
                }
            }
        }
        if (!actionRequest) {
            // If the last action isn't valid (eg a model with no resId and no view_type) which can
            // happen if the user edits the url and removes the id from the end of the url, we don't want
            // to send him back to the home menu: we unwind the actionStack until we find a valid action
            const { actionStack } = state;
            if (actionStack?.length > 1) {
                const nextState = { actionStack: actionStack.slice(0, -1) };
                Object.assign(nextState, nextState.actionStack.at(-1));
                const params = this._getActionParams(nextState);
                // Place the controller at the found position in the action stack to remove all the
                // invalid virtual controllers.
                if (params.options && params.options.index === undefined) {
                    params.options.index = nextState.actionStack.length - 1;
                }
                return params;
            }
            // Fall back to the home action if no valid action was found
            actionRequest = user.homeActionId;
        }
        return actionRequest ? { actionRequest, options } : null;
    }

    /**
     * @private
     * @param {ClientAction} action
     * @param {Object} props
     * @returns {{ props: ActionProps, config: Config }}
     */
    _getActionInfo(action, props) {
        const actionProps = Object.assign({}, props, { action, actionId: action.id });
        const currentState = {
            resId: actionProps.resId || false,
            active_id: action.context.active_id || false,
        };
        actionProps.updateActionState = (controller, patchState) => {
            const oldState = { ...currentState };
            Object.assign(currentState, patchState);
            const changed = !shallowEqual(currentState, oldState);
            if (changed && action.target !== "new" && controller.isMounted) {
                this.pushState();
            }
        };
        return {
            props: actionProps,
            currentState,
            config: {
                actionId: action.id,
                actionType: "ir.actions.client",
            },
            displayName: action.display_name || action.name || "",
        };
    }

    /**
     * @private
     * @param {Action} action
     * @returns {ActionMode}
     */
    _getActionMode(action) {
        if (action.target === "new") {
            // No possible override for target="new"
            return "new";
        }
        if (action.type === "ir.actions.client") {
            const clientAction = actionRegistry.get(action.tag);
            if (clientAction.target) {
                // Target is forced by the definition of the client action
                return clientAction.target;
            }
        }
        if (action.target === "fullscreen") {
            return "fullscreen";
        }
        // Default: current
        return "current";
    }

    /**
     * @private
     * @param {BaseView} view
     * @param {ActWindowAction} action
     * @param {BaseView[]} views
     * @param {Object} props
     */
    _getViewInfo(view, action, views, props = {}) {
        const target = action.target;
        const viewSwitcherEntries = views
            .filter((v) => v.multiRecord === view.multiRecord)
            .map((v) => {
                const viewSwitcherEntry = {
                    icon: v.icon,
                    name: v.display_name,
                    type: v.type,
                    multiRecord: v.multiRecord,
                };
                if (view.type === v.type) {
                    viewSwitcherEntry.active = true;
                }
                return viewSwitcherEntry;
            });
        const context = action.context || {};
        let groupBy = context.group_by || [];
        if (typeof groupBy === "string") {
            groupBy = [groupBy];
        }
        const openFormView = (resId, { activeIds, readonly, force, newWindow } = {}) => {
            if (target !== "new") {
                if (this._getView("form")) {
                    return this._switchView(
                        "form",
                        { readonly, resId, resIds: activeIds },
                        { newWindow }
                    );
                } else if (force || !resId) {
                    return this._doAction(
                        {
                            type: "ir.actions.act_window",
                            res_model: action.res_model,
                            views: [[false, "form"]],
                        },
                        { newWindow, props: { readonly, resId, resIds: activeIds } }
                    );
                }
            }
        };
        const viewProps = Object.assign({}, props, {
            context,
            display: { mode: target === "new" ? "inDialog" : target },
            domain: action.domain || [],
            groupBy,
            loadActionMenus: target !== "new" && action.res_model !== "res.config.settings",
            loadIrFilters: action.views.some((v) => v[1] === "search"),
            resModel: action.res_model,
            type: view.type,
            selectRecord: openFormView,
            createRecord: () => openFormView(false),
        });
        if (view.type === "form") {
            if (target === "new") {
                viewProps.readonly = false;
                if (!viewProps.onSave) {
                    viewProps.onSave = (record, params) => {
                        if (params && params.closable) {
                            this._doAction({ type: "ir.actions.act_window_close" });
                        }
                    };
                }
            }
        }

        const specialKeys = ["help", "useSampleModel", "limit", "count"];
        for (const key of specialKeys) {
            if (key in action) {
                if (key === "help") {
                    viewProps.noContentHelp = action.help;
                } else {
                    viewProps[key] = action[key];
                }
            }
        }

        if (context.search_disable_custom_filters) {
            viewProps.activateFavorite = false;
        }

        // view specific
        if (!viewProps.resId) {
            viewProps.resId = action.res_id || false;
        }

        const currentState = {
            resId: viewProps.resId,
            active_id: action.context.active_id || false,
        };
        viewProps.updateActionState = (controller, patchState) => {
            const oldState = { ...currentState };
            Object.assign(currentState, patchState);
            const changed = !shallowEqual(currentState, oldState);
            if (changed && target !== "new" && controller.isMounted) {
                this.pushState();
            }
        };

        viewProps.noBreadcrumbs =
            "_noBreadcrumbs" in action ? action._noBreadcrumbs : target === "new";

        const embeddedActions =
            view.type === "form"
                ? []
                : context.parent_action_embedded_actions || action.embedded_action_ids;
        const parentActionId = (view.type !== "form" && context.parent_action_id) || false;
        const currentEmbeddedActionId = context.current_embedded_action_id || false;
        return {
            props: viewProps,
            currentState,
            config: {
                actionId: action.id,
                actionName: action.name,
                cache: action.cache,
                actionType: "ir.actions.act_window",
                actionXmlId: action.xml_id,
                embeddedActions,
                parentActionId,
                currentEmbeddedActionId,
                views: action.views,
                viewSwitcherEntries,
            },
            displayName: action.display_name || action.name || "",
        };
    }

    /**
     * Computes the position of the controller in the nextStack according to options
     *
     * @private
     * @param {ActionOptions} options
     */
    _computeStackIndex(options) {
        if (options.clearBreadcrumbs) {
            return 0;
        } else if (options.stackPosition === "replaceCurrentAction") {
            const currentController = this.controllerStack[this.controllerStack.length - 1];
            if (currentController) {
                return this.controllerStack.findIndex(
                    (ct) => ct.action.jsId === currentController.action.jsId
                );
            }
        } else if (options.stackPosition === "replacePreviousAction") {
            let last;
            for (let i = this.controllerStack.length - 1; i >= 0; i--) {
                const action = this.controllerStack[i].action.jsId;
                if (!last) {
                    last = action;
                }
                if (action !== last) {
                    last = action;
                    break;
                }
            }
            if (last) {
                return this.controllerStack.findIndex((ct) => ct.action.jsId === last);
            }
            // TODO: throw if there is no previous action?
        } else if (options.index !== undefined) {
            return options.index;
        }
        return this.controllerStack.length;
    }

    /**
     * Open the action in a new window
     *
     * @private
     * @param {ActionDescription} action
     * @param {Object} state
     */
    _openActionInNewWindow(action, state) {
        // Session storage is duplicated in the new window
        // https://html.spec.whatwg.org/multipage/webstorage.html#webstorage
        // "After creating a new auxiliary browsing context and document, the session storage is copied over."

        // copy debug flag from current state
        const mode = this.debugMode.toString();
        if (mode) {
            state.debug = mode;
        }

        // Store current action of the current window
        const currentAction = browser.sessionStorage.getItem("current_action");
        const currentState = browser.sessionStorage.getItem("current_state");
        // Store on the session the action for the new window
        browser.sessionStorage.setItem("current_action", action._originalAction || "{}");
        browser.sessionStorage.setItem("current_state", JSON.stringify(state));
        this._openURL(this.router.stateToUrl(state));
        // restore the current action from the current window
        browser.sessionStorage.setItem("current_action", currentAction);
        browser.sessionStorage.setItem("current_state", currentState);
    }

    /**
     * Triggers a re-rendering with respect to the given controller.
     *
     * @private
     * @param {Controller} controller
     * @param {UpdateStackOptions} options
     * @param {boolean} [options.clearBreadcrumbs=false]
     * @param {number} [options.index]
     * @param {boolean} [options.keepDialogs=false]
     * @returns {Promise<Number>}
     */
    async _updateUI(controller, options = {}) {
        const manager = this;
        let removeDialogFn;
        const { promise: currentActionProm, resolve, reject } = Promise.withResolvers();
        const action = controller.action;
        if (action.target !== "new" && "newStack" in options) {
            this.controllerStack = options.newStack;
        }
        const index = this._computeStackIndex(options);
        const nextStack = [...this.controllerStack.slice(0, index), controller];
        if (action.target !== "new" && options.newWindow) {
            return this._openActionInNewWindow(action, this.makeState(nextStack));
        }
        // Compute breadcrumbs
        controller.config.breadcrumbs = proxy(
            action.target === "new" ? [] : this._getBreadcrumbs(nextStack)
        );
        controller.config.getDisplayName = () => controller.displayName;
        controller.config.setDisplayName = (displayName) => {
            controller.displayName = displayName;
            if (controller === this._getCurrentController()) {
                // if not mounted yet, will be done in "mounted"
                this.title.setParts({ action: controller.displayName });
            }
            if (action.target !== "new") {
                // This is a hack to force the reactivity when a new displayName is set
                controller.config.breadcrumbs.push(undefined);
                controller.config.breadcrumbs.pop();
            }
        };
        controller.config.setCurrentEmbeddedAction = (embeddedActionId) => {
            controller.currentEmbeddedActionId = embeddedActionId;
        };
        controller.config.setEmbeddedActions = (embeddedActions) => {
            controller.embeddedActions = embeddedActions;
        };
        controller.config.historyBack = () => {
            const previousController = this.controllerStack[this.controllerStack.length - 2];
            if (previousController) {
                this.restore(previousController.jsId);
            } else {
                this.bus.trigger("WEBCLIENT:LOAD_DEFAULT_APP");
            }
        };
        controller.config.isReloadingController = controller === this.controllerStack.at(-1);

        class ControllerComponent extends Component {
            static template = ControllerComponentTemplate;
            static Component = controller.Component;
            props = useProps();
            setup() {
                this.Component = controller.Component;
                this.titleService = useService("title");
                useDebugCategory("action", { action });
                useSubEnv({
                    config: controller.config,
                    pushStateBeforeReload: () => {
                        if (controller.isMounted) {
                            return;
                        }
                        manager.pushState(nextStack, { sync: true });
                    },
                });
                if (action.target !== "new") {
                    this.__beforeLeave__ = new CallbackRecorder();
                    this.__getGlobalState__ = new CallbackRecorder();
                    this.__getLocalState__ = new CallbackRecorder();
                    useBus(manager.bus, "CLEAR-UNCOMMITTED-CHANGES", (ev) => {
                        const callbacks = ev.detail;
                        const beforeLeaveFns = this.__beforeLeave__.callbacks;
                        callbacks.push(...beforeLeaveFns);
                    });
                    if (this.constructor.Component !== View) {
                        useSubEnv({
                            __beforeLeave__: this.__beforeLeave__,
                            __getGlobalState__: this.__getGlobalState__,
                            __getLocalState__: this.__getLocalState__,
                        });
                    }
                }

                onMounted(this.onMounted);
                onWillUnmount(this.onWillUnmount);
                onError(this.onError);
            }
            onError(error) {
                if (controller.isMounted) {
                    // the error occurred on the controller which is
                    // already in the DOM, so simply show the error
                    Promise.reject(error);
                    return;
                }
                if (!controller.isMounted && status(this) === "mounted") {
                    // The error occurred during an onMounted hook of one of the components.
                    manager.bus.trigger("ACTION_MANAGER:UPDATE", {
                        id: ++manager.id,
                        Component: BlankComponent,
                        componentProps: {
                            onMounted: () => {},
                            withControlPanel: action.type === "ir.actions.act_window",
                        },
                    });
                    Promise.reject(error);
                    return;
                }
                // forward the error to the _updateUI caller then restore the action container
                // to an unbroken state
                reject(error);
                if (action.target === "new") {
                    removeDialogFn?.();
                    return;
                }
                const index = manager.controllerStack.findIndex(
                    (ct) => ct.jsId === controller.jsId
                );
                if (index > 0) {
                    // The error occurred while rendering an existing controller,
                    // so go back to the previous controller, of the current faulty one.
                    // This occurs when clicking on a breadcrumbs.
                    return manager._restore(manager.controllerStack[index - 1].jsId, {
                        keepDialogs: true,
                    });
                }
                if (index === 0) {
                    // No previous controller to restore, so do nothing but display the error
                    return;
                }
                const lastController = manager.controllerStack.at(-1);
                if (lastController) {
                    if (lastController.jsId !== controller.jsId) {
                        // the error occurred while rendering a new controller,
                        // so go back to the last non faulty controller
                        // (the error will be shown anyway as the promise
                        // has been rejected)
                        return manager._restore(lastController.jsId, { keepDialogs: true });
                    }
                } else {
                    manager.bus.trigger("ACTION_MANAGER:UPDATE", {});
                }
            }
            onMounted() {
                if (action.target === "new") {
                    manager.dialog?.remove();
                    manager.dialog = manager.nextDialog;
                } else {
                    controller.getGlobalState = () => {
                        const exportFns = this.__getGlobalState__.callbacks;
                        if (exportFns.length) {
                            return Object.assign({}, ...exportFns.map((fn) => fn()));
                        }
                    };
                    controller.getLocalState = () => {
                        const exportFns = this.__getLocalState__.callbacks;
                        if (exportFns.length) {
                            return Object.assign({}, ...exportFns.map((fn) => fn()));
                        }
                    };

                    manager.controllerStack = nextStack; // the controller is mounted, commit the new stack
                    manager.pushState(manager.controllerStack, { sync: true });
                    this.titleService.setParts({ action: controller.displayName });
                    browser.sessionStorage.setItem(
                        "current_action",
                        action._originalAction || "{}"
                    );
                    browser.sessionStorage.setItem("current_lang", user.lang);
                }
                resolve();
                manager.bus.trigger("ACTION_MANAGER:UI-UPDATED", manager._getActionMode(action));
                controller.isMounted = true;
            }
            onWillUnmount() {
                controller.isMounted = false;
            }
            get componentProps() {
                const componentProps = { ...this.props };
                const updateActionState = componentProps.updateActionState;
                componentProps.updateActionState = (newState) =>
                    updateActionState(controller, newState);
                if (this.constructor.Component === View) {
                    componentProps.__beforeLeave__ = this.__beforeLeave__;
                    componentProps.__getGlobalState__ = this.__getGlobalState__;
                    componentProps.__getLocalState__ = this.__getLocalState__;
                }
                return componentProps;
            }
        }
        if (action.target === "new") {
            const actionDialogProps = {
                ActionComponent: ControllerComponent,
                actionProps: controller.props,
                actionType: action.type,
            };
            if (action.name) {
                // @todo jesc: move this logic in the proper location
                // Something to do with Quality Check specific logic
                if (Array.isArray(action.name)) {
                    actionDialogProps.title = action.name[0];
                } else {
                    actionDialogProps.title = action.name;
                }
            }
            const size = DIALOG_SIZES[action.context.dialog_size];
            if (size) {
                actionDialogProps.size = size;
            }
            actionDialogProps.header = action.context.header ?? actionDialogProps.header;
            actionDialogProps.footer = action.context.footer ?? actionDialogProps.footer;
            const onClose = this.dialog?.onClose;
            delete this.dialog?.onClose;
            removeDialogFn = this.dialogService.add(ActionDialog, actionDialogProps, {
                onClose: (closeParams) => this._removeDialog(closeParams),
            });
            if (this.nextDialog) {
                this.nextDialog.remove();
            }
            this.nextDialog = {
                remove: removeDialogFn,
                onClose: onClose || options.onClose,
            };
            return currentActionProm;
        }

        const currentController = this._getCurrentController();
        if (currentController && currentController.getLocalState) {
            currentController.exportedState = currentController.getLocalState();
        }
        if (controller.exportedState) {
            controller.props.state = controller.exportedState;
        }

        // TODO DAM Remarks:
        // this thing seems useless for client actions.
        // restore and switchView (at least) use this --> cannot be done in switchView only
        // if prop globalState has been passed in doAction, since the action is new the prop won't be overridden in l655.
        // if globalState is not useful for client actions --> maybe use that thing in useSetupView instead of useSetupAction?
        // a good thing: the Object.assign seems to reflect the use of "externalState" in legacy Model class --> things should be fine.
        if (currentController && currentController.getGlobalState) {
            const globalState = Object.assign(
                {},
                currentController.action.globalState,
                currentController.getGlobalState() // what if this = {}?
            );

            currentController.action.globalState = globalState;
            // Avoid pushing the globalState, if the state on the router was changed.
            // For instance, if a link was clicked, the state of the router will be the one of the link and not the one of the currentController.
            // Or when using the back or forward buttons on the browser.
            if (
                currentController.state.action === this.router.current.action &&
                currentController.state.active_id === this.router.current.active_id &&
                currentController.state.resId === this.router.current.resId
            ) {
                this.router.pushState({ globalState }, { sync: true });
            }
        }
        if (controller.action.globalState) {
            controller.props.globalState = controller.action.globalState;
        }

        if (options.clearBreadcrumbs && !options.noEmptyTransition) {
            const { promise, resolve } = Promise.withResolvers();
            this.bus.trigger("ACTION_MANAGER:UPDATE", {
                id: ++this.id,
                Component: BlankComponent,
                componentProps: {
                    onMounted: () => resolve(),
                    withControlPanel: action.type === "ir.actions.act_window",
                },
                fullscreen: this._getActionMode(action) === "fullscreen",
            });
            await promise;
        }
        if (options.onActionReady) {
            options.onActionReady(action);
        }
        controller.__info__ = {
            id: ++this.id,
            Component: ControllerComponent,
            componentProps: controller.props,
        };
        if (!options.keepDialogs) {
            this.dialogService.closeAll({ noReload: true });
        }
        this.bus.trigger("ACTION_MANAGER:UPDATE", controller.__info__);
        await currentActionProm;
    }

    // ---------------------------------------------------------------------------
    // ir.actions.act_url
    // ---------------------------------------------------------------------------

    /** @private */
    _openURL(url) {
        const w = browser.open(url, "_blank");
        if (!w || w.closed || typeof w.closed === "undefined") {
            const msg = _t(
                "A popup window has been blocked. You may need to change your browser settings to allow popup windows for this page. You can also copy the link and paste it in a new tab."
            );
            this.notification.add(msg, {
                sticky: true,
                type: "warning",
                buttons: [
                    {
                        name: _t("Copy"),
                        primary: true,
                        onClick: async () => {
                            const fullUrl = new URL(url, window.location.origin).href;
                            navigator.clipboard.writeText(fullUrl);
                        },
                    },
                ],
            });
        }
    }

    /**
     * Executes actions of type 'ir.actions.act_url', i.e. redirects to the
     * given url.
     *
     * @private
     * @param {ActURLAction} action
     * @param {ActionOptions} options
     */
    _executeActURLAction(action, options) {
        let url = action.url;
        if (url && !(url.startsWith("http") || url.startsWith("/"))) {
            url = "/" + url;
        }
        if (action.target === "self") {
            browser.location.assign(url);
        } else if (action.target === "download") {
            this._openURL(url);
        } else {
            this._openURL(url);
            if (action.close) {
                return this._doAction(
                    { type: "ir.actions.act_window_close" },
                    { onClose: options.onClose }
                );
            } else if (options.onClose) {
                options.onClose();
            }
        }
    }

    // ---------------------------------------------------------------------------
    // ir.actions.act_window
    // ---------------------------------------------------------------------------

    /**
     * Executes an action of type 'ir.actions.act_window'.
     *
     * @private
     * @param {ActWindowAction} action
     * @param {ActionOptions} options
     */
    async _executeActWindowAction(action, options) {
        const views = [];
        const unknown = [];
        for (const [, type] of action.views) {
            if (type === "search") {
                continue;
            }
            if (session.view_info[type]) {
                const { icon, display_name, multi_record: multiRecord } = session.view_info[type];
                views.push({ icon, display_name, multiRecord, type });
            } else {
                unknown.push(type);
            }
        }
        if (unknown.length) {
            throw new Error(
                `View types not defined ${unknown.join(", ")} found in act_window action ${
                    action.id
                }`
            );
        }
        if (!views.length) {
            throw new Error(`No view found for act_window action ${action.id}`);
        }

        let view = (options.viewType && views.find((v) => v.type === options.viewType)) || views[0];
        if (this.ui.isSmall()) {
            view = this._findView(views, view.multiRecord, action.mobile_view_mode) || view;
        }
        if (
            this.offlinePlugin.isOffline() &&
            !this.offlinePlugin.isAvailableOffline(
                action.id,
                view.type,
                options.props?.resId || action.res_id || false
            )
        ) {
            view =
                views.find((v) => this.offlinePlugin.isAvailableOffline(action.id, v.type)) || view;
        }

        const controller = this._makeController({
            Component: View,
            action,
            view,
            views,
            ...this._getViewInfo(view, action, views, options.props),
        });
        action.controllers[view.type] = controller;

        const newStackLastController = options.newStack?.at(-1);
        if (newStackLastController?.lazy) {
            const multiView = action.views.find(
                (view) => view[1] !== "form" && view[1] !== "search"
            );
            if (multiView) {
                // If the current action has a multi-record view, we add the last
                // controller to the breadcrumb controllers.
                delete newStackLastController.lazy;
                newStackLastController.displayName = action.display_name || action.name || "";
                newStackLastController.action = action;
                newStackLastController.props.type = multiView[1];
            } else {
                // If the current action doesn't have a multi-record view,
                // we don't need to add the last controller to the breadcrumb controllers
                options.newStack.splice(-1);
            }
        }
        return this._updateUI(controller, options);
    }

    /**
     * @private
     * @param {Array} views an array of views
     * @param {boolean} multiRecord true if we search for a multiRecord view
     * @param {string} viewType type of the view to search
     * @returns {Object|undefined} the requested view if it could be found
     */
    _findView(views, multiRecord, viewType) {
        return views.find((v) => v.type === viewType && v.multiRecord == multiRecord);
    }

    // ---------------------------------------------------------------------------
    // ir.actions.client
    // ---------------------------------------------------------------------------

    /**
     * Executes an action of type 'ir.actions.client'.
     *
     * @private
     * @param {ClientAction} action
     * @param {ActionOptions} options
     */
    async _executeClientAction(action, options) {
        const clientAction = actionRegistry.get(action.tag);
        action.path ||= clientAction.path;
        if (clientAction.prototype instanceof Component) {
            if (action.target !== "new" && !options.newWindow) {
                const canProceed = await clearUncommittedChanges(
                    this.bus,
                    pick(options, "forceLeave")
                );
                if (!canProceed) {
                    return;
                }
                if (clientAction.target) {
                    action.target = clientAction.target;
                }
            }
            const props = clientAction.extractProps?.(action) || {};
            const controller = this._makeController({
                Component: clientAction,
                action,
                ...this._getActionInfo(action, { ...props, ...options.props }),
            });
            controller.displayName ||= clientAction.displayName?.toString() || "";
            return this._updateUI(controller, options);
        } else {
            const next = await this.scope.run(() => clientAction(this.env, action, options));
            if (next) {
                return this._doAction(next, options);
            }
        }
    }

    // ---------------------------------------------------------------------------
    // ir.actions.report
    // ---------------------------------------------------------------------------

    /** @private */
    _executeReportClientAction(action, options) {
        const props = Object.assign({}, options.props, {
            data: action.data,
            display_name: action.display_name,
            name: action.name,
            report_name: action.report_name,
            report_url: getReportUrl(action, "html", user.context),
            context: Object.assign({}, action.context),
        });

        const controller = this._makeController({
            Component: ReportAction,
            action,
            ...this._getActionInfo(action, props),
        });

        return this._updateUI(controller, options);
    }

    /**
     * Executes actions of type 'ir.actions.report'.
     *
     * @private
     * @param {ReportAction} action
     * @param {ActionOptions} options
     */
    async _executeReportAction(action, options) {
        const handlers = registry.category("ir.actions.report handlers").getAll();
        for (const handler of handlers) {
            const result = await this.scope.run(() => handler(action, options, this.env));
            if (result) {
                const { onClose } = options;
                if (action.close_on_report_download) {
                    return this._doAction({ type: "ir.actions.act_window_close" }, { onClose });
                } else if (onClose) {
                    onClose();
                }
                return result;
            }
        }
        if (action.report_type === "qweb-html") {
            return this._executeReportClientAction(action, options);
        } else if (
            action.report_type.startsWith("qweb-pdf") ||
            action.report_type === "qweb-text"
        ) {
            let type = action.report_type.slice(5);
            let engineName;
            if (type.startsWith("pdf-")) {
                engineName = type.slice(4);
                type = "pdf";
            }
            let success, message;
            this.ui.block();
            try {
                const downloadContext = { ...user.context };
                if (action.context) {
                    Object.assign(downloadContext, action.context);
                }
                ({ success, message } = await downloadReport(
                    rpc,
                    action,
                    type,
                    downloadContext,
                    engineName
                ));
            } finally {
                this.ui.unblock();
            }
            if (message) {
                this.notification.add(message, {
                    sticky: true,
                    title: _t("Report"),
                });
            }
            if (!success) {
                return this._executeReportClientAction(action, options);
            }
            const { onClose } = options;
            if (action.close_on_report_download) {
                return this._doAction({ type: "ir.actions.act_window_close" }, { onClose });
            } else if (onClose) {
                onClose();
            }
        } else {
            console.error(
                `The ActionManager can't handle reports of type ${action.report_type}`,
                action
            );
        }
    }

    // ---------------------------------------------------------------------------
    // ir.actions.server
    // ---------------------------------------------------------------------------

    /**
     * Executes an action of type 'ir.actions.server'.
     *
     * @private
     * @param {ServerAction} action
     * @param {ActionOptions} options
     * @returns {Promise<void>}
     */
    async _executeServerAction(action, options) {
        const runProm = rpc("/web/action/run", {
            action_id: action.id,
            context: makeContext([user.context, action.context]),
        });
        let nextAction = await this.keepLast.add(runProm);
        if (nextAction.help) {
            nextAction.help = markup(nextAction.help);
        }
        nextAction = nextAction || { type: "ir.actions.act_window_close" };
        if (typeof nextAction === "object") {
            nextAction.path ||= action.path;
        }
        return this._doAction(nextAction, options);
    }

    /** @private */
    _executeCloseAction(params = {}) {
        if (this.dialog) {
            return this._removeDialog(params.onCloseInfo);
        }
        return params.onClose?.(params.onCloseInfo);
    }

    // ---------------------------------------------------------------------------
    // public API
    // ---------------------------------------------------------------------------

    /**
     * Main entry point of a 'doAction' request. Loads the action and executes it.
     *
     * @param {ActionRequest} actionRequest
     * @param {ActionOptions} options
     * @returns {Promise<number | undefined | void>}
     */
    doAction = this._doAction.bind(this);

    /** @private */
    async _doAction(actionRequest, options = {}) {
        const actionProm = this._loadAction(actionRequest, options.additionalContext);
        let action = await this.keepLast.add(actionProm);
        action = this._preprocessAction(action, options.additionalContext);
        options.clearBreadcrumbs = action.target === "main" || options.clearBreadcrumbs;
        switch (action.type) {
            case "ir.actions.act_url":
                return this._executeActURLAction(action, options);
            case "ir.actions.act_window":
                if (action.target !== "new" && !options.newWindow) {
                    const canProceed = await clearUncommittedChanges(
                        this.bus,
                        pick(options, "forceLeave")
                    );
                    if (!canProceed) {
                        return;
                    }
                }
                return this._executeActWindowAction(action, options);
            case "ir.actions.act_window_close":
                return this._executeCloseAction({
                    onClose: options.onClose,
                    onCloseInfo: action.infos,
                });
            case "ir.actions.client":
                return this._executeClientAction(action, options);
            case "ir.actions.server":
                return this._executeServerAction(action, options);
            case "ir.actions.report":
                return this._executeReportAction(action, options);
            default: {
                const handler = actionHandlersRegistry.get(action.type, null);
                if (handler !== null) {
                    return this.scope.run(() => handler({ env: this.env, action, options }));
                }
                throw new Error(
                    `The ActionManager service can't handle actions of type ${action.type}`
                );
            }
        }
    }

    /**
     * Executes an action on top of the current one (typically, when a button in a
     * view is clicked). The button may be of type 'object' (call a given method
     * of a given model) or 'action' (execute a given action). Alternatively, the
     * button may have the attribute 'special', and in this case an
     * 'ir.actions.act_window_close' is executed.
     *
     * @param {DoActionButtonParams} params
     * @params {Object} [options={}]
     * @params {boolean} [options.isEmbeddedAction] set to true if the action request is an
     *  embedded action. This allows to do the necessary context cleanup and avoid infinite
     *  recursion.
     * @params {boolean} [options.newWindow] set to true to open the action in a new tab/window.
     * @returns {Promise<void>}
     */
    doActionButton = this._doActionButton.bind(this);

    /** @private */
    async _doActionButton(params, { isEmbeddedAction, newWindow } = {}) {
        if (!params.name && !params.special) {
            return;
        }
        // determine the action to execute according to the params
        let action;
        if (!isEmbeddedAction) {
            for (const key of EMBEDDED_ACTIONS_CTX_KEYS) {
                delete params.context?.[key];
            }
        }
        const context = makeContext([params.context, params.buttonContext]);
        const blockUi = exprToBoolean(params["block-ui"]);
        if (blockUi) {
            this.ui.block();
        }
        if (params.special) {
            action = { type: "ir.actions.act_window_close", infos: { special: true } };
        } else if (params.type === "object") {
            // call a Python Object method, which may return an action to execute
            let args = params.resId ? [[params.resId]] : [params.resIds];
            if (params.args) {
                let additionalArgs;
                try {
                    // warning: quotes and double quotes problem due to json and xml clash
                    // maybe we should force escaping in xml or do a better parse of the args array
                    additionalArgs = JSON.parse(params.args.replace(/'/g, '"'));
                } catch {
                    browser.console.error("Could not JSON.parse arguments", params.args);
                }
                args = args.concat(additionalArgs);
            }
            const callProm = rpc(`/web/dataset/call_button/${params.resModel}/${params.name}`, {
                args,
                kwargs: { context },
                method: params.name,
                model: params.resModel,
            });
            action = await this.keepLast.add(callProm);
            action =
                action && typeof action === "object"
                    ? action
                    : { type: "ir.actions.act_window_close" };
            if (action.help) {
                action.help = markup(action.help);
            }
        } else if (params.type === "action") {
            // execute a given action, so load it first
            context.active_id = params.resId || null;
            context.active_ids = params.resIds;
            context.active_model = params.resModel;
            action = await this.keepLast.add(this._loadAction(params.name, context));
        } else {
            if (blockUi) {
                this.ui.unblock();
            }
            throw new InvalidButtonParamsError("Missing type for doActionButton request");
        }
        if (!isEmbeddedAction && action.embedded_action_ids?.length) {
            const embeddedActionsKey = `${action.id}+${params.resId || ""}`;
            const embeddedActionsOrder =
                user.settings.embedded_actions_config_ids?.[embeddedActionsKey]
                    ?.embedded_actions_order;
            const embeddedActionId = embeddedActionsOrder?.[0];
            const embeddedAction = action.embedded_action_ids?.find(
                (embeddedAction) => embeddedAction.id === embeddedActionId
            );
            if (embeddedAction) {
                const embeddedActions = [
                    ...action.embedded_action_ids,
                    {
                        id: false,
                        name: action.name,
                        parent_action_id: action.id,
                        parent_res_model: action.res_model,
                        action_id: action.id,
                        user_id: false,
                        context: {},
                    },
                ];
                const context = {
                    ...action.context,
                    ...(embeddedAction.context ? makeContext([embeddedAction.context]) : {}),
                    active_id: params.resId,
                    active_model: params.resModel,
                    current_embedded_action_id: embeddedActionId,
                    parent_action_embedded_actions: embeddedActions,
                    parent_action_id: action.id,
                };
                await this._doActionButton(
                    {
                        name:
                            embeddedAction.python_method ||
                            embeddedAction.action_id[0] ||
                            embeddedAction.action_id,
                        resId: params.resId,
                        context,
                        type: embeddedAction.python_method ? "object" : "action",
                        resModel: embeddedAction.parent_res_model,
                        viewType: embeddedAction.default_view_mode,
                    },
                    { isEmbeddedAction: true }
                );
                return;
            }
        }
        // filter out context keys that are specific to the current action, because:
        //  - wrong default_* and search_default_* values won't give the expected result
        //  - wrong group_by values will fail and forbid rendering of the destination view
        const currentCtx = {};
        for (const key in params.context) {
            if (key.match(CTX_KEY_REGEX) === null) {
                currentCtx[key] = params.context[key];
            }
        }
        const activeCtx = { active_model: params.resModel };
        if (params.resId) {
            activeCtx.active_id = params.resId;
            activeCtx.active_ids = [params.resId];
        }
        action.context = makeContext([currentCtx, params.buttonContext, activeCtx, action.context]);
        // in case an effect is returned from python and there is already an effect
        // attribute on the button, the priority is given to the button attribute
        const effect = params.effect ? evaluateExpr(params.effect) : action.effect;
        const { onClose, stackPosition, viewType } = params;
        await this._doAction(action, {
            newWindow,
            onClose,
            stackPosition,
            viewType,
        });
        if (params.close) {
            await this._executeCloseAction();
        }
        if (blockUi) {
            this.ui.unblock();
        }
        if (effect) {
            this.effectService.add(effect);
        }
    }

    /**
     * Switches to the given view type in action of the last controller of the
     * stack. This action must be of type 'ir.actions.act_window'.
     *
     * @param {ViewType} viewType
     * @param {Object} [props={}]
     * @params {Object} [options={}]
     * @params {boolean} [options.newWindow] set to true to open the action in a new tab/window.
     * @throws {ViewNotFoundError} if the viewType is not found on the current action
     * @returns {Promise<Number>}
     */
    switchView = this._switchView.bind(this);

    /** @private */
    async _switchView(viewType, props = {}, { newWindow } = {}) {
        await this.keepLast.add(Promise.resolve());
        if (this.dialog) {
            // we don't want to switch view when there's a dialog open, as we would
            // not switch in the correct action (action in background != dialog action)
            return;
        }
        const controller = this.controllerStack[this.controllerStack.length - 1];
        const view = this._getView(viewType);
        if (!view) {
            throw new ViewNotFoundError(
                _t("No view of type '%s' could be found in the current action.", viewType)
            );
        }
        const newController =
            controller.action.controllers[viewType] ||
            this._makeController({
                Component: View,
                action: controller.action,
                views: controller.views,
                view,
            });

        if (!newWindow) {
            const canProceed = await clearUncommittedChanges(this.bus);
            if (!canProceed) {
                return;
            }
        }

        Object.assign(
            newController,
            this._getViewInfo(view, controller.action, controller.views, props)
        );
        controller.action.controllers[viewType] = newController;
        let index;
        if (view.multiRecord) {
            index = this.controllerStack.findIndex(
                (ct) => ct.action.jsId === controller.action.jsId
            );
            index = index > -1 ? index : this.controllerStack.length - 1;
        } else {
            // This case would mostly happen when loadState detects a change in the URL.
            // Also, I guess we may need it when we have other monoRecord views
            index = this.controllerStack.findIndex(
                (ct) =>
                    ct.action.jsId === controller.action.jsId && !ct.virtual && !ct.view.multiRecord
            );
            index = index > -1 ? index : this.controllerStack.length;
        }
        await this._updateUI(newController, { newWindow, index });
    }

    /**
     * Restores a controller from the controller stack given its id. Typically,
     * this function is called when clicking on the breadcrumbs. If no id is given
     * restores the previous controller from the stack (penultimate).
     *
     * @param {string} jsId
     */
    restore = async (jsId) => this._restore(jsId);

    /**
     * @private
     * @param {string} jsId
     * @param {Object} [options]
     * @param {boolean} [options.keepDialogs=false]
     */
    async _restore(jsId, { keepDialogs = false } = {}) {
        await this.keepLast.add(Promise.resolve());
        let index;
        if (!jsId) {
            index = this.controllerStack.length - 2;
        } else {
            index = this.controllerStack.findIndex((controller) => controller.jsId === jsId);
        }
        if (index < 0) {
            const msg = jsId ? "Invalid controller to restore" : "No controller to restore";
            throw new ControllerNotFoundError(msg);
        }
        const canProceed = await clearUncommittedChanges(this.bus);
        if (!canProceed) {
            return;
        }
        const controller = this.controllerStack[index];
        if (controller.virtual) {
            const actionParams = this._getActionParams(controller.state);
            if (!actionParams) {
                throw new Error("Attempted to restore a virtual controller whose state is invalid");
            }
            const { actionRequest, options } = actionParams;
            this.controllerStack = this.controllerStack.slice(0, index);
            return this._doAction(actionRequest, options);
        }
        if (controller.action.type === "ir.actions.act_window") {
            if (controller.isMounted) {
                controller.exportedState = controller.getLocalState();
            }
            const { action, exportedState, view, views } = controller;
            const props = { ...controller.props };
            if (exportedState && "resId" in exportedState) {
                // When restoring, we want to use the last exported ID of the controller
                props.resId = exportedState.resId;
            }
            Object.assign(controller, this._getViewInfo(view, action, views, props));
        }
        return this._updateUI(controller, { index, keepDialogs });
    }

    /**
     * Restores a stack of virtual controllers from the current contents of the
     * state (usually router.current) and performs a "doAction" on the last one.
     *
     * @param {object} [state]
     * @returns {Promise<boolean>} true if doAction was performed
     */
    loadState = this._loadState.bind(this);

    /** @private */
    async _loadState(state = this.router.current) {
        const lang = browser.sessionStorage.getItem("current_lang");
        if (lang && lang !== user.lang) {
            browser.sessionStorage.removeItem("current_action");
            browser.sessionStorage.removeItem("current_lang");
            browser.sessionStorage.removeItem("current_state");
        }
        const newStack = await this._controllersFromState(state);
        const actionParams = this._getActionParams(state);
        if (actionParams) {
            // Params valid => performs a "doAction"
            const { actionRequest, options } = actionParams;
            if (options.index) {
                options.newStack = newStack.slice(0, options.index);
                delete options.index;
            } else {
                options.newStack = newStack;
            }
            try {
                await this._doAction(actionRequest, options);
            } catch (error) {
                if (
                    error.exceptionName === "odoo.addons.web.controllers.action.MissingActionError"
                ) {
                    if (state.actionStack.length > 1) {
                        const newState = {
                            ...state.actionStack.slice(0, -1).at(-1),
                            actionStack: [...state.actionStack.slice(0, -1)],
                        };
                        return this._loadState(newState);
                    } else {
                        this.bus.trigger("WEBCLIENT:LOAD_DEFAULT_APP");
                    }
                } else {
                    throw error;
                }
            }
            return true;
        }
    }

    loadAction = async (actionRequest, context) => {
        const action = await this._loadAction(actionRequest, context);
        return this._preprocessAction(action, context);
    };

    get currentController() {
        return this._getCurrentController();
    }

    get currentAction() {
        return this._getCurrentAction();
    }

    /** @private */
    makeState(cStack) {
        const actions = cStack.map((controller) => {
            const { action, props, displayName } = controller;
            const actionState = { displayName };
            if (action.path || action.id) {
                actionState.action = action.path || action.id;
            } else if (action.type === "ir.actions.client") {
                actionState.action = action.tag;
            } else if (action.type === "ir.actions.act_window") {
                actionState.model = props.resModel;
            }
            if (action.type === "ir.actions.act_window") {
                actionState.view_type = props.type;
                if (props.type === "form" && action.res_model !== "res.config.settings") {
                    actionState.resId = controller.currentState.resId || "new";
                }
            }
            if (action.type === "ir.actions.client" && controller.currentState?.resId) {
                actionState.resId = controller.currentState.resId;
            }

            if (controller.currentState?.active_id) {
                const activeId = controller.currentState.active_id;
                if (activeId) {
                    actionState.active_id = activeId;
                }
            }
            Object.assign(actionState, omit(controller.currentState || {}, ...PATH_KEYS));
            return actionState;
        });
        const newState = {
            actionStack: actions,
        };
        const stateKeys = [...PATH_KEYS];
        const { action, props, currentState } = cStack.at(-1);
        if (props.type !== "form" && props.type !== action.views?.[0][1]) {
            // add view_type only when it's not already known implicitly
            stateKeys.push("view_type");
        }
        if (currentState) {
            stateKeys.push(...Object.keys(omit(currentState, ...PATH_KEYS)));
        }
        return Object.assign(newState, pick(newState.actionStack.at(-1), ...stateKeys));
    }

    /** @private */
    pushState(cStack = this.controllerStack, options) {
        if (!cStack.length) {
            return;
        }

        const newState = this.makeState(cStack);
        browser.sessionStorage.setItem("current_state", JSON.stringify(newState));

        cStack.at(-1).state = newState;
        this.router.pushState(newState, Object.assign({ replace: true }, options));
    }
}

services.add(ActionManagerPlugin);

/**
 * -----------------------------------------------------------------------------
 * @todo owl3 migration
 * temporary - to remove when all use of the action service are removed
 * -----------------------------------------------------------------------------
 */
export const actionService = {
    dependencies: ["dialog", "effect", "localization", "notification", "title", "ui"],
    start() {
        return usePlugin(ActionManagerPlugin);
    },
};

registry.category("services").add("action", actionService);
