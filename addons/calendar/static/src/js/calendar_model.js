odoo.define('calendar.CalendarModel', function (require) {
    "use strict";

    const Model = require('web.CalendarModel');

    const CalendarModel = Model.extend({

        /**
         * @override
         * Transform fullcalendar event object to odoo Data object
         */
        calendarEventToRecord(event) {
            const data = this._super(event);
            return _.extend({}, data, {
                'recurrence_update': event.recurrenceUpdate,
            });
        },
        /**
         * Split the events to display an event for each attendee with the correct status.
         * If the all filter is activated, we don't display an event for each attendee and keep
         * the previous behavior to display a single event.
         * 
         * @override
         */
        async _calendarEventByAttendee(events) {
            var self = this;
            var data = await this._super(...arguments);
            const allFilter = self.loadParams.filters.partner_ids && _.find(self.loadParams.filters.partner_ids.filters, f => f.value === "all") || false;
            const attendeeIDs = self.loadParams.filters.partner_ids && _.filter(_.map(self.loadParams.filters.partner_ids.filters, partner => partner.value !== 'all' ? partner.value : false), id => id !== false);
            const eventIDs = _.map(events, event => event.id);
            // Fetch the attendees' info from the partners selected in the filter to display the events
            this.attendees = await self._rpc({
                model: 'res.partner',
                method: 'get_attendee_detail',
                args: [attendeeIDs, eventIDs],
            }).then(function (result) {
                return _.map(result, function (d) {
                    return _.object(['id', 'display_name', 'status', 'color', 'event_id', 'attendee_id', 'is_alone'], d);
                });
            });
            if (allFilter && !allFilter.active) {
                _.each(events, function (event) {
                    _.each(event.record.partner_ids, function (attendee) {
                        if (_.find(self.loadParams.filters.partner_ids.filters, f => f.active && f.value == attendee)) {
                            let e = JSON.parse(JSON.stringify(event));
                            e.attendee_id = attendee;
                            const attendee_info = _.find(self.attendees, a => a.id == attendee && a.event_id == e.record.id);
                            if (attendee_info) {
                                e.record.attendee_status = attendee_info.status;
                                e.record.is_alone = attendee_info.id === self.getSession().partner_id ? attendee_info.is_alone : false;
                            }
                            
                            data.push(e);
                        }
                    });
                });
            }
            data = data.length ? data : self.data.data;
            return data;
        },

        /**
         * Decline an event for the actual attendee
         * @param {Integer} eventId
         */
        declineEvent: function (event) {
            return this._rpc({
                model: 'calendar.attendee',
                method: 'do_decline',
                args: [_.find(this.attendees, attendee => attendee.event_id === event.id && attendee.id === this.getSession().partner_id).attendee_id],
            });
        },
    });

    return CalendarModel;
});
