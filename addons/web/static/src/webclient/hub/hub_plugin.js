import { Plugin, signal, useListener, usePlugin } from "@odoo/owl";
import { rpc, rpcBus } from "@web/core/network/rpc";
import { ORM, UPDATE_METHODS } from "@web/core/orm_plugin";
import { registry } from "@web/core/registry";
import { services } from "@web/core/services";
import { user } from "@web/core/user";
import { session } from "@web/session";
import { Mutex } from "@web/core/utils/concurrency";
import { pick } from "@web/core/utils/objects";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";
import { HubTabs } from "./hub_tabs";

/**
 * @typedef {Object} HubItem a button of the hub view of a record (see ``web_get_hub``)
 * @property {string} key identifies the item in the user settings, e.g. "object:action_view_tasks"
 * @property {"object"|"action"} type
 * @property {string} name the method called or the id of the action opened
 * @property {string} string
 * @property {Object} context evaluated on the record
 */

/**
 * @typedef {Object} RecordHub the hub of a record, shared by the controllers of
 *  the actions opened for it (e.g. while switching between its tabs)
 * @property {string} key identifies the record and its hub view
 * @property {string} resModel
 * @property {number} resId
 * @property {number|false} hubViewId
 * @property {import("@odoo/owl").Signal<HubItem[]>} items the items shown for the record (none until loaded)
 * @property {import("@odoo/owl").Signal<string[]>} pinnedItemKeys keys of the items pinned by the user, in display order
 * @property {import("@odoo/owl").Signal<boolean>} showTabs whether the user shows the tabs of the hub
 * @property {import("@odoo/owl").Signal<string>} displayName of the record
 * @property {Promise} loaded resolved once the items are loaded
 */

/**
 * @typedef {Object} Hub the hub of the record an action is opened for (``config.hub``)
 * @property {string} resModel
 * @property {number} resId
 * @property {string|null} activeItemKey key of the item currently opened, if known
 * @property {() => HubItem[]} items the items shown for the record (none until loaded)
 * @property {() => string[]} pinnedItemKeys keys of the items pinned by the user, in display order
 * @property {() => boolean} showTabs whether the user shows the tabs of the hub
 * @property {() => Promise} toggleTabs shows or hides the tabs
 * @property {(vals: Object) => Promise} saveSetting saves ``pinned_item_keys`` and/or ``show_tabs``
 * @property {(item: HubItem, options?: Object) => Promise} openItem opens ``item`` in place of the current action
 */

function hubSettingKey(resModel, resId) {
    return `${resModel},${resId}`;
}

/**
 * @param {string} resModel
 * @param {number} resId
 * @returns {{ pinned_item_keys: string[], show_tabs: boolean }} the setting of
 *  the user for the hub of the record: the keys of the pinned items, in display
 *  order, and whether the tabs are shown
 */
function getHubSetting(resModel, resId) {
    return {
        pinned_item_keys: [],
        show_tabs: false,
        ...user.settings.hub_config_ids?.[hubSettingKey(resModel, resId)],
    };
}

/**
 * @param {Object} action
 * @returns {number|false} the hub view chosen by ``action`` for its records
 */
function getHubViewId(action) {
    const hubView = action?.hub_view_id;
    return (Array.isArray(hubView) ? hubView[0] : hubView) || false;
}

/**
 * @param {Object} controller
 * @returns {{ resModel: string|undefined, hubViewId: number|false }} the model
 *  of the records of ``controller``, and the hub view chosen by its action for
 *  them, also known when the controller is restored without its action (see
 *  ``extraState.hub``)
 */
function getControllerHub(controller) {
    const { action, props, extraState } = controller;
    return {
        resModel: props.resModel || action.res_model || extraState?.hub?.res_model,
        hubViewId: getHubViewId(action) || extraState?.hub?.view_id || false,
    };
}

/**
 * Shows the hub of the record an action is opened for (its active record): the
 * buttons of the hub view of the record's model (see ``web_get_hub``), as tabs
 * above the views of the action. It puts the hub on the config of the
 * controllers (``config.hub``), with the component of its tabs
 * (``config.HubTabs``).
 *
 * The hub view is the one chosen by the action displaying the record (its
 * ``hub_view_id``), or the default hub view of its model.
 *
 * The hub of the record currently displayed is kept while its actions are
 * opened (e.g. switching between its tabs), so that its items are only loaded
 * once, and again when a record of its model is modified.
 */
export class HubPlugin extends Plugin {
    #action = usePlugin(ActionPlugin);
    #orm = usePlugin(ORM);
    /** @type {RecordHub|null} the hub of the record currently displayed */
    #recordHub = null;
    /** the item being opened, to know the active item of the opened action */
    #openingItem = null;
    /** the saves of the settings, run one after the other */
    #saveMutex = new Mutex();

    setup() {
        this.#action.controllerSetups.use((controller, stack) => {
            if (controller.action.target === "new") {
                return;
            }
            // kept with the state of the controller, as its action isn't
            // loaded again when it is restored as a breadcrumb
            const hubViewId = getHubViewId(controller.action);
            if (hubViewId) {
                controller.extraState.hub = {
                    ...controller.extraState.hub,
                    res_model: controller.action.res_model,
                    view_id: hubViewId,
                };
            }
            const record = session.hub_models?.length && this.#getActiveRecord(controller, stack);
            if (record && (!record.resModel || session.hub_models.includes(record.resModel))) {
                controller.config.hub = this.#makeHub(controller, record);
                controller.config.HubTabs = HubTabs;
            } else {
                // another record (or none) is displayed: its hub is loaded again next time
                this.#recordHub = null;
            }
        });
        // the items depend on the values of the record (see web_get_hub)
        useListener(rpcBus, "RPC:RESPONSE", (ev) => {
            const { model, method } = ev.detail.data.params || {};
            const recordHub = this.#recordHub;
            if (recordHub && model === recordHub.resModel && UPDATE_METHODS.includes(method)) {
                if (!ev.detail.error) {
                    recordHub.loaded = this.#loadItems(recordHub);
                }
            }
        });
    }

    /**
     * Return the record ``controller`` is opened for (``active_id``), with what
     * is known of it: its model, the controller displaying it (if any) and the
     * hub view chosen by the action of that controller.
     *
     * The model is the ``active_model`` of the action, set when it is opened
     * by a button. Otherwise (e.g. the action is restored from the url), it is
     * the model of the controller displaying the record.
     *
     * @param {Object} controller
     * @param {Object[]} stack the stack of controllers ``controller`` ends
     * @returns {Object|null}
     */
    #getActiveRecord(controller, stack) {
        const { active_id: resId, active_model } = controller.action.context || {};
        if (!resId) {
            return null;
        }
        // the controller displaying the record: the last one of another action
        const { id: actionId, path: actionPath, jsId } = controller.action;
        const parent = stack
            .slice(0, -1)
            .findLast(
                ({ action }) =>
                    !(
                        (jsId && action.jsId === jsId) ||
                        (action.id && [actionId, actionPath].includes(action.id))
                    )
            );
        const parentHub = parent ? getControllerHub(parent) : {};
        let resModel = active_model;
        if (!resModel && parent?.props.resId === resId) {
            resModel = parentHub.resModel;
        }
        // the action of the parent displays records of the hub's model, so its
        // hub view applies to them
        return {
            resModel,
            resId,
            parent,
            hubViewId: resModel && parentHub.resModel === resModel ? parentHub.hubViewId : false,
        };
    }

    /**
     * @param {Object} controller
     * @param {Object} record the active record of ``controller`` (see ``#getActiveRecord``)
     * @returns {Hub}
     */
    #makeHub(controller, record) {
        const { resId } = record;
        const opening = this.#openingItem;
        const isOpening = opening?.resId === resId && opening?.resModel === record.resModel;
        const recordHub = signal(null);
        // the opened item, also known when the controller is restored (e.g.
        // on a reload)
        const activeItemKey = isOpening
            ? opening.key
            : controller.extraState.hub?.item_key ||
              (controller.action.id && `action:${controller.action.id}`);
        if (activeItemKey) {
            controller.extraState.hub = { ...controller.extraState.hub, item_key: activeItemKey };
        }
        const hub = {
            get resModel() {
                return recordHub()?.resModel || record.resModel;
            },
            resId,
            activeItemKey,
            items: () => recordHub()?.items() || [],
            pinnedItemKeys: () => recordHub()?.pinnedItemKeys() || [],
            showTabs: () => recordHub()?.showTabs() || false,
            toggleTabs: () => this.#toggleTabs(recordHub()),
            saveSetting: (vals) => this.#saveSetting(recordHub(), vals),
            openItem: (item, options = {}) =>
                this.openItem(item, hub, { stackPosition: "replaceCurrentAction", ...options }),
        };
        const setRecordHub = (resModel, hubViewId) => {
            const current = this.#getRecordHub(resModel, resId, hubViewId);
            recordHub.set(current);
            // e.g. "Project X - Tasks"
            current.loaded.then(() => {
                const activeItem = current.items().find((item) => item.key === hub.activeItemKey);
                if (activeItem) {
                    controller.config.setDisplayName(`${current.displayName()} - ${activeItem.string}`);
                }
            });
        };
        if (record.resModel) {
            setRecordHub(record.resModel, record.hubViewId);
        } else {
            this.#loadModel(record).then(({ resModel, hubViewId }) => {
                if (session.hub_models.includes(resModel)) {
                    setRecordHub(resModel, hubViewId);
                }
            });
        }
        return hub;
    }

    /**
     * @param {Object} record an active record whose model is not known (see
     *  ``#getActiveRecord``), e.g. back in the browser history, where the
     *  breadcrumbs are not loaded
     * @returns {Promise<{ resModel: string|false, hubViewId: number|false }>}
     *  its model and hub view, from the controller displaying it
     */
    async #loadModel(record) {
        const { parent } = record;
        if (parent?.props.resId !== record.resId || !parent.state) {
            return { resModel: false, hubViewId: false };
        }
        const [res] = await rpc("/web/action/load_breadcrumbs", {
            actions: [pick(parent.state, "action", "model", "resId")],
        });
        return { resModel: res.res_model || false, hubViewId: res.hub_view_id || false };
    }

    /**
     * @param {string} resModel
     * @param {number} resId
     * @param {number|false} hubViewId
     * @returns {RecordHub} the hub of the record, the one currently displayed
     *  if it is the same, otherwise a new one (whose items are being loaded)
     */
    #getRecordHub(resModel, resId, hubViewId) {
        const key = JSON.stringify([resModel, resId, hubViewId]);
        if (this.#recordHub?.key !== key) {
            const setting = getHubSetting(resModel, resId);
            const recordHub = {
                key,
                resModel,
                resId,
                hubViewId,
                items: signal([]),
                pinnedItemKeys: signal(setting.pinned_item_keys),
                showTabs: signal(setting.show_tabs),
                displayName: signal(""),
            };
            recordHub.loaded = this.#loadItems(recordHub);
            this.#recordHub = recordHub;
        }
        return this.#recordHub;
    }

    /**
     * @param {RecordHub} recordHub
     * @returns {Promise} resolved once the items of ``recordHub`` are loaded
     */
    async #loadItems(recordHub) {
        const { resModel, resId, hubViewId } = recordHub;
        const hubData = await this.#orm.call(resModel, "web_get_hub", [[resId]], {
            view_id: hubViewId,
        });
        recordHub.items.set(hubData?.items || []);
        recordHub.displayName.set(hubData?.display_name || "");
    }

    /**
     * Save the setting ``vals`` (``pinned_item_keys`` and/or ``show_tabs``) of
     * ``hub`` for its record. The displayed tabs and the local copy of the user
     * settings are updated before the server, so that what is opened meanwhile
     * already uses them.
     *
     * @param {RecordHub} hub
     * @param {{ pinned_item_keys?: string[], show_tabs?: boolean }} vals
     */
    async #saveSetting(hub, vals) {
        if ("pinned_item_keys" in vals) {
            hub.pinnedItemKeys.set(vals.pinned_item_keys);
        }
        if ("show_tabs" in vals) {
            hub.showTabs.set(vals.show_tabs);
        }
        user.updateUserSettings("hub_config_ids", {
            ...user.settings.hub_config_ids,
            [hubSettingKey(hub.resModel, hub.resId)]: {
                ...getHubSetting(hub.resModel, hub.resId),
                ...vals,
            },
        });
        await this.#saveMutex.exec(() =>
            this.#orm.call("res.users.settings", "set_hub_setting", [
                user.settings.id,
                hub.resModel,
                hub.resId,
                vals,
            ])
        );
    }

    /**
     * Shows or hides the tabs of ``hub`` for its record. The first time they
     * are shown, the pinned items start from the default setting of the server
     * (e.g. the ones of the project manager on a project); when they are shown
     * with no item pinned, the first item is pinned.
     *
     * @param {RecordHub} hub
     */
    async #toggleTabs(hub) {
        const vals = { show_tabs: !hub.showTabs() };
        if (
            vals.show_tabs &&
            !(hubSettingKey(hub.resModel, hub.resId) in (user.settings.hub_config_ids || {}))
        ) {
            const defaultSetting = await this.#orm.call(
                "res.users.settings",
                "get_default_hub_setting",
                [user.settings.id, hub.resModel, hub.resId]
            );
            if (defaultSetting.pinned_item_keys) {
                vals.pinned_item_keys = defaultSetting.pinned_item_keys;
            }
        }
        const items = hub.items();
        if (
            vals.show_tabs &&
            !(vals.pinned_item_keys || hub.pinnedItemKeys()).length &&
            items.length
        ) {
            vals.pinned_item_keys = [items[0].key];
        }
        return this.#saveSetting(hub, vals);
    }

    /**
     * @param {string} resModel
     * @param {number} resId
     * @param {number|false} hubViewId the hub view to use, if not the default one
     * @returns {Promise<HubItem|null>} the item to open by default for the
     *  record: the first one pinned by the user, or the first one of the hub
     */
    async getDefaultItem(resModel, resId, hubViewId = false) {
        // the hub is kept for the opened action, which shows it
        const recordHub = this.#getRecordHub(resModel, resId, hubViewId);
        await recordHub.loaded;
        const items = recordHub.items();
        const pinnedItems = recordHub
            .pinnedItemKeys()
            .map((key) => items.find((item) => item.key === key))
            .filter(Boolean);
        return pinnedItems[0] || items[0] || null;
    }

    /**
     * @param {HubItem} item
     * @param {{ resModel: string, resId: number }} record the hub's record
     * @param {Object} [options] options of the action
     */
    async openItem(item, { resModel, resId }, options = {}) {
        const { newWindow, ...actionOptions } = options;
        this.#openingItem = { resModel, resId, key: item.key };
        try {
            return await this.#action.doActionButton(
                {
                    type: item.type,
                    name: item.name,
                    resModel,
                    resId,
                    buttonContext: item.context,
                    ...actionOptions,
                },
                { newWindow }
            );
        } finally {
            this.#openingItem = null;
        }
    }
}

services.add(HubPlugin);

/**
 * Open the hub of the active record on its default item, e.g.
 * <kanban action="hub_default" type="action">. The hub is the one chosen by the
 * action displaying the record (e.g. the one of the kanban view).
 */
async function hubDefaultAction(action, options) {
    const hubPlugin = usePlugin(HubPlugin);
    const actionPlugin = usePlugin(ActionPlugin);
    const { active_model: resModel, active_id: resId } = action.context || {};
    const parent = actionPlugin.currentController;
    const parentHub = parent ? getControllerHub(parent) : {};
    const hubViewId = parentHub.resModel === resModel ? parentHub.hubViewId : false;
    const item = resId && (await hubPlugin.getDefaultItem(resModel, resId, hubViewId));
    if (!item) {
        throw new Error(`No hub to open for ${resModel} record ${resId}`);
    }
    return hubPlugin.openItem(item, { resModel, resId }, options);
}

registry.category("actions").add("hub_default", hubDefaultAction);
