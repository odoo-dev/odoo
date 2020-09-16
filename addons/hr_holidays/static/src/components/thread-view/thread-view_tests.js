/** @odoo-module alias=hr_holidays.components.ThreadView.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('hr_holidays', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('ThreadView', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('out of office message on direct chat with out of office partner', async function (assert) {
    assert.expect(2);

    // Returning date of the out of office partner, simulates he'll be back in a month
    const returningDate = moment.utc().add(1, 'month');
    this.data['mail.channel'].records.push(
        {
            channel_type: 'chat',
            id: 20,
            members: [this.data.currentPartnerId, 11],
        },
    );
    // Needed partner & user to allow simulation of message reception
    this.data['res.partner'].records.push(
        {
            id: 11,
            name: "Foreigner partner",
            out_of_office_date_end: returningDate.format("YYYY-MM-DD HH:mm:ss"),
        },
    );
    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch(
        'Thread/findById',
        {
            id: 20,
            model: 'mail.channel',
        },
    );
    const threadViewer = env.services.action.dispatch(
        'ThreadViewer/create',
        {
            hasThreadView: true,
            thread: env.services.action.dispatch(
                'RecordFieldCommand/link',
                thread,
            ),
        },
    );
    await env.services.action.dispatch(
        'Component/mount',
        'ThreadView',
        {
            hasComposer: true,
            threadView: threadViewer.threadView(),
        },
    );
    assert.containsOnce(
        document.body,
        '.o-ThreadView-outOfOffice',
        "should have an out of office alert on thread view",
    );
    const formattedDate = returningDate.toDate().toLocaleDateString(
        env.services.model.messaging.locale().language().replace(/_/g, '-'),
        { day: 'numeric', month: 'short' },
    );
    assert.ok(
        document.querySelector('.o-ThreadView-outOfOffice').textContent.includes(formattedDate),
        "out of office message should mention the returning date",
    );
});

});
});
});
