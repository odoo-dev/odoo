/** @odoo-module alias=mail.utils._readActivities **/

import { auto_str_to_date } from 'web.time';

/**
 * Fetches activities and postprocesses them.
 *
 * This standalone function performs an RPC, but to do so, it needs an instance
 * of a widget that implements the _rpc() function.
 *
 * @todo i'm not very proud of the widget instance given in arguments, we should
 *   probably try to do it a better way in the future.
 *
 * @param {Widget} self a widget instance that can perform RPCs
 * @param {Array} ids the ids of activities to read
 * @return {Promise<Array>} resolved with the activities
 */
export default async function _readActivities(self, ids) {
    if (!ids.length) {
        return [];
    }
    let context = self.getSession().user_context;
    if (self.record && !_.isEmpty(self.record.getContext())) {
        context = self.record.getContext();
    }
    let activities = await self._rpc({
        model: 'mail.activity',
        method: 'activity_format',
        args: [ids],
        context: context,
    });
    // convert create_date and date_deadline to moments
    _.each(activities, function (activity) {
        activity.create_date = moment(auto_str_to_date(activity.create_date));
        activity.date_deadline = moment(auto_str_to_date(activity.date_deadline));
    });
    // sort activities by due date
    activities = _.sortBy(activities, 'date_deadline');
    return activities;
}
