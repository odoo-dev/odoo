/** @odoo-module **/

import { registerModel } from '@mail/model/model_core';
import { attr, many, one } from '@mail/model/model_field';
import { clear } from '@mail/model/model_field_command';

registerModel({
    name: 'ActivityCellView',
    template: 'mail.ActivityCellView',
    recordMethods: {
        onClick() {
            this.update({ activityListPopoverView: this.activityListPopoverView ? clear() : {} });
        },
    },
    fields: {
        activityListPopoverView: one('PopoverView', { inverse: 'activityCellViewOwnerAsActivityList' }),
        activityType: one('ActivityType', { required: true }),
        closestDeadline: attr({ required: true }),
        closestDeadlineFormatted: attr({
            compute() {
                const date = moment(this.closestDeadline).toDate();
                // To remove year only if current year
                if (moment().year() === moment(date).year()) {
                    return date.toLocaleDateString(moment().locale(), {
                        day: 'numeric', month: 'short'
                    });
                } else {
                    return moment(date).format('ll');
                }
            },
        }),
        contentRef: attr({ ref: 'content' }),
        filteredActivities: many('Activity', {
            compute() {
                return this.thread.activities.filter(activity => activity.type === this.activityType);
            },
        }),
        id: attr({ identifying: true }),
        reloadFunc: attr({ required: true }),
        thread: one('Thread', { required: true }),
    },
});
