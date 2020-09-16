/** @odoo-module alias=mail.utils._setDelayLabel **/

import { _t } from 'web.core';

/**
 * Set the 'label_delay' entry in activity data according to the deadline date
 *
 * @param {Array} activities list of activity Object
 * @return {Array} : list of modified activity Object
 */
export default function _setDelayLabel(activities) {
    const today = moment().startOf('day');
    for (const activity of activities) {
        let toDisplay = '';
        const diff = activity.date_deadline.diff(today, 'days', true); // true means no rounding
        if (diff === 0) {
            toDisplay = _t("Today");
        } else {
            if (diff < 0) { // overdue
                if (diff === -1) {
                    toDisplay = _t("Yesterday");
                } else {
                    toDisplay = _.str.sprintf(_t("%d days overdue"), Math.abs(diff));
                }
            } else { // due
                if (diff === 1) {
                    toDisplay = _t("Tomorrow");
                } else {
                    toDisplay = _.str.sprintf(_t("Due in %d days"), Math.abs(diff));
                }
            }
        }
        activity.label_delay = toDisplay;
    }
    return activities;
}
