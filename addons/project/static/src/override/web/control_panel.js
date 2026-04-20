import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";
import { ControlPanel } from "@web/search/control_panel/control_panel";


patch(ControlPanel.prototype, {
    setup() {
        super.setup();
        onMounted(() => {
            this._fixOverviewPriorityIfNeeded();
        });
    },

    /**
     * One-time, self-persisting fix: if a previously saved order (from
     * before this restriction existed) has the project Overview action
     * first, swap it with the next embedded action, notify the user,
     * and persist the corrected order so this doesn't need to run again.
     */
    _fixOverviewPriorityIfNeeded() {
        const embeddedActions = this.state.embeddedInfos.embeddedActions;
        if (embeddedActions.length < 2) {
            return;
        }
        const overviewAction = embeddedActions.find(isProjectOverviewAction);
        if (!overviewAction || embeddedActions[0].id !== overviewAction.id) {
            return;
        }
        const newOrder = embeddedActions.map((a) => a.id);
        [newOrder[0], newOrder[1]] = [newOrder[1], newOrder[0]];
        this._sortEmbeddedActions(newOrder);
        this.embeddedActionsConfigHandler.setEmbeddedActionsConfig({
            embedded_actions_order: newOrder,
        });
        this.notificationService.add(
            _t(
                "%s can't be the priority view, so it's been moved to second place.",
                overviewAction.name
            ),
            { type: "warning" }
        );
    },

    /**
     * @override
     * Blocks dropping the Overview action into the first (priority) slot
     * going forward.
     */
    _sortEmbeddedActionDrop({ element, previous }) {
        const embeddedActions = this.state.embeddedInfos.embeddedActions;
        const overviewAction = embeddedActions.find(isProjectOverviewAction);
        const elementId = Number(element.dataset.id) || false;
        if (
            overviewAction &&
            elementId === overviewAction.id &&
            !previous &&
            embeddedActions.length > 1
        ) {
            this.notificationService.add(
                _t("%s cannot be set as the priority view.", overviewAction.name),
                { type: "warning" }
            );
            return;
        }
        super._sortEmbeddedActionDrop(...arguments);
    },
});