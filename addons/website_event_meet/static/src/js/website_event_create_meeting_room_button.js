odoo.define('website_event_meet.website_event_create_room_button', function (require) {
'use strict';

const publicWidget = require('web.public.widget');
const core = require('web.core');
const QWeb = core.qweb;

publicWidget.registry.websiteEventCreateMeetingRoom = publicWidget.Widget.extend({
    selector: '.o_wevent_create_room_button',
    xmlDependencies: ['/website_event_meet/static/src/xml/website_event_meeting_room.xml'],
    events: {
        'click': '_onClickCreate',
    },

    start: async function () {
        const langs = await this._rpc({
            route: "/event/active_langs",
        });

        this.$createModal = $(QWeb.render(
            'event_meet_create_room_modal',
            {
                csrf_token: odoo.csrf_token,
                eventId: this.$el.data("eventId"),
                defaultLangCode: this.$el.data("defaultLangCode"),
                langs: langs,
            }
        ));
        this.$createModal.appendTo(this.$el);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    _onClickCreate: async function () {
        this.$createModal.modal('show');
    },
});

return publicWidget.registry.websiteEventMeetingRoom;

});
