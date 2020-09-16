/** @odoo-module alias=calendar.Activity **/

import Activity from 'mail.viewFields.Activity';

import { _t } from 'web.core';
import Dialog from 'web.Dialog';

Activity.include({
    /**
     * Override behavior to redirect to calendar event instead of activity
     *
     * @override
     */
    _onEditActivity(event, options) {
        const activityId = $(event.currentTarget).data('activity-id');
        const activity = this.activities.find(act => act.id === activityId);
        if (
            activity &&
            activity.activity_category === 'meeting' &&
            activity.calendar_event_id
        ) {
            return this._super(
                event,
                {
                    res_model: 'calendar.event',
                    res_id: activity.calendar_event_id[0],
                },
            );
        }
        return this._super(event, options);
    },
    /**
     * Override behavior to warn that the calendar event is about to be removed as well
     *
     * @override
     */
    _onUnlinkActivity(ev, options) {
        ev.preventDefault();
        const activityId = $(ev.currentTarget).data('activity-id');
        const activity = this.activities.find(act => act.id === activityId);
        if (
            activity &&
            activity.activity_category === 'meeting' &&
            activity.calendar_event_id
        ) {
            Dialog.confirm(
                this,
                _t("The activity is linked to a meeting. Deleting it will remove the meeting as well. Do you want to proceed ?"),
                {
                    confirm_callback: async () => {
                        await this._rpc({
                            model: 'mail.activity',
                            method: 'unlink_w_meeting',
                            args: [[activityId]],
                        });
                        this._reload({ activity: true });
                    },
                },
            );
        }
        else {
            return this._super(ev, options);
        }
    },
});
