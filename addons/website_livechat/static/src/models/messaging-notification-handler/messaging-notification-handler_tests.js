/** @odoo-module alias=website_livechat.models.MessagingNotificationhandler.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

import FormView from 'web.FormView';
import { createView } from 'web.test_utils';
import { intercept } from 'web.test_utils_mock';

QUnit.module('website_livechat', {}, function () {
QUnit.module('models', {}, function () {
QUnit.module('MessagingNotificationHandler', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('should open chat window on send chat request to website visitor', async function (assert) {
    assert.expect(3);

    this.data['website.visitor'].records.push(
        {
            display_name: "Visitor #11",
            id: 11,
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch('Component/mount', 'ChatWindowManager');
    await createView({
        arch: `
            <form>
                <header>
                    <button name="action_send_chat_request" string="Send chat request" class="btn btn-primary" type="button"/>
                </header>
                <field name="name"/>
            </form>
        `,
        model: 'website.visitor',
        res_id: 11,
        View: FormView,
    });
    intercept(this.widget, 'execute_action', payload => {
        env.services.rpc({
            route: '/web/dataset/call_button',
            params: {
                args: [payload.data.env.resIDs],
                kwargs: { context: payload.data.env.context },
                method: payload.data.action_data.name,
                model: payload.data.env.model,
            },
        });
    });
    await afterNextRender(
        () => document.querySelector('button[name="action_send_chat_request"]').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-ChatWindow',
        "should have a chat window open after sending chat request to website visitor",
    );
    assert.hasClass(
        document.querySelector('.o-ChatWindow'),
        'o-isFocused',
        "chat window of livechat should be focused on open",
    );
    assert.strictEqual(
        document.querySelector('.o-ChatWindowHeader-name').textContent,
        "Visitor #11",
        "chat window of livechat should have name of visitor in the name",
    );
});

});
});
});
