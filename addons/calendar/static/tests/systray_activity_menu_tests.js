/** @odoo-module alias=calendar.ActivityMenu.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

import { click } from 'web.test_utils_dom';
import { intercept } from 'web.test_utils_mock';

QUnit.module('calendar', {}, function () {
QUnit.module('ActivityMenu', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);

        Object.assign(this.data, {
            'calendar.event': {
                fields: { // those are all fake, this is the mock of a formatter
                    meetings: { type: 'binary' },
                    model: { type: 'char' },
                    name: { type: 'char', required: true },
                    type: { type: 'char' },
                },
                records: [
                    {
                        meetings: [
                            {
                                allday: false,
                                id: 1,
                                name: "meeting1",
                                res_model: 'calendar.event',
                                start: '2018-04-20 06:30:00',
                            },
                            {
                                allday: false,
                                id: 2,
                                name: "meeting2",
                                res_model: 'calendar.event',
                                start: '2018-04-20 09:30:00',
                            },
                        ],
                        model: 'calendar.event',
                        name: "Today's meeting (3)",
                        type: 'meeting',
                    },
                ],
            },
        });
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('activity menu widget:today meetings', async function (assert) {
    assert.expect(6);

    const self = this;
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (args.method === 'systray_get_activities') {
                return self.data['calendar.event']['records'];
            }
            return this._super(...arguments);
        },
    });
    await env.services.action.dispatch(
        'Component/mount',
        'ActivityMenu',
    );
    assert.hasClass(
        document.body,
        'o_mail_systray_item',
        "should be the instance of widget",
    );

    await click($('.dropdown-toggle'));
    intercept(activityMenu, 'do_action', function (event) {
        assert.strictEqual(
            event.data.action,
            'calendar.action_calendar_event',
            "should open meeting calendar view in day mode",
        );
    });
    await click($('.o_mail_preview'));
    assert.ok($('.o_meeting_filter'), "should be a meeting");
    assert.containsN(
        document.body,
        '.o_meeting_filter',
        2,
        "there should be 2 meetings",
    );
    assert.hasClass(
        $('.o_meeting_filter').eq(0),
        'o_meeting_bold',
        "this meeting is yet to start",
    );
    assert.doesNotHaveClass(
        $('.o_meeting_filter').eq(1),
        'o_meeting_bold',
        "this meeting has been started",
    );
});

});
});
