import { Plugin } from "@html_editor/plugin";
import { CacheWeak } from "@web/core/utils/cache";

/**
 * @typedef {Object} BuilderAction
 * @property {string} id
 * @property {Function} apply
 * @property {Function} [isApplied]
 * @property {Function} [clean]
 * @property {() => Promise<any>} [load]
 */

export class BuilderActionsPlugin extends Plugin {
    static id = "builderActions";
    static shared = ["getAction", "clearActionCache"];
    resources = {
        step_added_handlers: ({ isPreviewing }) => {
            if (!isPreviewing) {
                this.clearActionCache();
            }
        },
    };

    setup() {
        this.actions = {};

        this.actionCache = new CacheWeak(
            (actionId, ...args) => this.actions[actionId]._isApplied?.(...args),
            (actionId, ...args) => {
                const editingElement = args[0].editingElement;
                const param = JSON.stringify(args[0].param);
                const value = args[0].value;
                return [actionId, editingElement, param, value];
            }
        );
        for (const actions of this.getResource("builder_actions")) {
            for (const [actionId, action] of Object.entries(actions)) {
                if (actionId in this.actions) {
                    throw new Error(`Duplicate builder action id: ${action.id}`);
                }
                this.actions[actionId] = {
                    id: actionId,
                    ...action,
                    _isApplied: action.isApplied,
                    isApplied: (...args) => this.actionCache.read(actionId, ...args),
                };
            }
        }
        Object.freeze(this.actions);
    }

    /**
     * Get the action object for the given action ID.
     *
     * @param {string} actionId
     * @returns {Object}
     */
    getAction(actionId) {
        const action = this.actions[actionId];
        if (!action) {
            throw new Error(`Unknown builder action id: ${actionId}`);
        }
        return action;
    }

    clearActionCache() {
        this.actionCache.invalidate();
    }
}
