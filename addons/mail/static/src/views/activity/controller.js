/** @odoo-module alias=mail.views.activity.Controller **/

import 'mail.viewFields.KanbanActivity';

import BasicController from 'web.BasicController';
import { _t } from 'web.core';
import field_registry from 'web.field_registry';
import ViewDialogs from 'web.view_dialogs';

const KanbanActivity = field_registry.get('kanban_activity');

const ActivityController = BasicController.extend({
    custom_events: {
        ...BasicController.prototype.custom_events,
        empty_cell_clicked: '_onEmptyCell',
        schedule_activity: '_onScheduleActivity',
        send_mail_template: '_onSendMailTemplate',
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     * @param parent
     * @param model
     * @param renderer
     * @param {Object} params
     * @param {String} params.title The title used in schedule activity dialog
     */
    init(parent, model, renderer, params) {
        this._super(...arguments);
        this.title = params.title;
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Overridden to remove the pager as it makes no sense in this view.
     *
     * @override
     */
    _getPagingInfo() {
        return null;
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onScheduleActivity() {
        const state = this.model.get(this.handle);
        new ViewDialogs.SelectCreateDialog(this, {
            context: state.context,
            disable_multiple_selection: true,
            domain: this.model.originalDomain,
            no_create: !this.activeActions.create,
            on_selected: record => {
                const fakeRecord = state.getKanbanActivityData({}, record[0]);
                const widget = new KanbanActivity(this, 'activity_ids', fakeRecord, {});
                widget.scheduleActivity();
            },
            res_model: state.model,
            title: _.str.sprintf(_t("Search: %s"), this.title),
        }).open();
    },
    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onEmptyCell(ev) {
        const state = this.model.get(this.handle);
        this.do_action(
            {
                context: {
                    default_res_id: ev.data.resId,
                    default_res_model: state.model,
                    default_activity_type_id: ev.data.activityTypeId,
                },
                res_id: false,
                res_model: 'mail.activity',
                target: 'new',
                type: 'ir.actions.act_window',
                view_mode: 'form',
                view_type: 'form',
                views: [[false, 'form']],
            },
            {
                on_close: () => this.reload(),
            },
        );
    },
    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onSendMailTemplate(ev) {
        const templateId = ev.data.templateID;
        const activityTypeId = ev.data.activityTypeID;
        const state = this.model.get(this.handle);
        const groupedActivities = state.grouped_activities;
        const resIds = [];
        for (const resId of Object.keys(groupedActivities)) {
            const activityByType = groupedActivities[resId];
            const activity = activityByType[activityTypeId];
            if (activity) {
                resIds.push(parseInt(resId));
            }
        }
        this._rpc({
            model: this.model.modelName,
            method: 'activity_send_mail',
            args: [resIds, templateId],
        });
    },
});

export default ActivityController;
