/** @odoo-module alias=mail.components.MessageSeenIndicator.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('MessageSeenIndicator', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('rendering when just one has received the message', async function (assert) {
    assert.expect(3);

    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 1000,
        $$$model: 'mail.channel',
        $$$partnerSeenInfos: env.services.action.dispatch('RecordFieldCommand/create', [
            {
                $$$channelId: 1000,
                $$$lastFetchedMessage: env.services.action.dispatch('RecordFieldCommand/insert', {
                    $$$id: 100,
                }),
                $$$partnerId: 10,
            },
            {
                $$$channelId: 1000,
                $$$partnerId: 100,
            },
        ]),
        $$$messageSeenIndicators: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$channelId: 1000,
            $$$messageId: 100,
        }),
    });
    const message = env.services.action.dispatch('Message/insert', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$displayName: "Demo User",
            $$$id: env.services.model.messaging.$$$currentPartner().$$$id(),
        }),
        $$$body: "<p>Test</p>",
        $$$id: 100,
        $$$originThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    await env.services.action.dispatch('Component/mount', 'MessageSeenIndicator', { message, thread });
    assert.containsOnce(
        document.body,
        '.o-MessageSeenIndicator',
        "should display a message seen indicator component",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-MessageSeenIndicator'),
        'o-isAllSeen',
        "indicator component should not be considered as all seen",
    );
    assert.containsOnce(
        document.body,
        '.o-MessageSeenIndicator-icon',
        "should display only one seen indicator icon",
    );
});

QUnit.test('rendering when everyone have received the message', async function (assert) {
    assert.expect(3);

    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 1000,
        $$$model: 'mail.channel',
        $$$partnerSeenInfos: env.services.action.dispatch('RecordFieldCommand/create', [
            {
                $$$channelId: 1000,
                $$$lastFetchedMessage: env.services.action.dispatch('RecordFieldCommand/insert', {
                    $$$id: 100,
                }),
                $$$partnerId: 10,
            },
            {
                $$$channelId: 1000,
                $$$lastFetchedMessage: env.services.action.dispatch('RecordFieldCommand/insert', {
                    $$$id: 99,
                }),
                $$$partnerId: 100,
            },
        ]),
        $$$messageSeenIndicators: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$channelId: 1000,
            $$$messageId: 100,
        }),
    });
    const message = env.services.action.dispatch('Message/insert', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$displayName: "Demo User",
            $$$id: env.services.model.messaging.$$$currentPartner().$$$id(),
        }),
        $$$body: "<p>Test</p>",
        $$$id: 100,
        $$$originThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    await env.services.action.dispatch('Component/mount', 'MessageSeenIndicator', { message, thread });
    assert.containsOnce(
        document.body,
        '.o-MessageSeenIndicator',
        "should display a message seen indicator component",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-MessageSeenIndicator'),
        'o-isAllSeen',
        "indicator component should not be considered as all seen",
    );
    assert.containsOnce(
        document.body,
        '.o-MessageSeenIndicator-icon',
        "should display only one seen indicator icon",
    );
});

QUnit.test('rendering when just one has seen the message', async function (assert) {
    assert.expect(3);

    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 1000,
        $$$model: 'mail.channel',
        $$$partnerSeenInfos: env.services.action.dispatch('RecordFieldCommand/create', [
            {
                $$$channelId: 1000,
                $$$lastFetchedMessage: env.services.action.dispatch('RecordFieldCommand/insert', {
                    $$$id: 100,
                }),
                $$$lastSeenMessage: env.services.action.dispatch('RecordFieldCommand/insert', {
                    $$$id: 100,
                }),
                $$$partnerId: 10,
            },
            {
                $$$channelId: 1000,
                $$$lastFetchedMessage: env.services.action.dispatch('RecordFieldCommand/insert', {
                    $$$id: 99,
                }),
                $$$partnerId: 100,
            },
        ]),
        $$$messageSeenIndicators: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$channelId: 1000,
            $$$messageId: 100,
        }),
    });
    const message = env.services.action.dispatch('Message/insert', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$displayName: "Demo User",
            $$$id: env.services.model.messaging.$$$currentPartner(this).$$$id(this),
        }),
        $$$body: "<p>Test</p>",
        $$$id: 100,
        $$$originThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    await env.services.action.dispatch('Component/mount', 'MessageSeenIndicator', { message, thread });
    assert.containsOnce(
        document.body,
        '.o-MessageSeenIndicator',
        "should display a message seen indicator component",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-MessageSeenIndicator'),
        'o-isAllSeen',
        "indicator component should not be considered as all seen",
    );
    assert.containsN(
        document.body,
        '.o-MessageSeenIndicator-icon',
        2,
        "should display two seen indicator icon",
    );
});

QUnit.test('rendering when just one has seen & received the message', async function (assert) {
    assert.expect(3);

    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 1000,
        $$$model: 'mail.channel',
        $$$partnerSeenInfos: env.services.action.dispatch('RecordFieldCommand/create', [
            {
                $$$channelId: 1000,
                $$$lastFetchedMessage: env.services.action.dispatch('RecordFieldCommand/insert', {
                    $$$id: 100,
                }),
                $$$lastSeenMessage: env.services.action.dispatch('RecordFieldCommand/insert', {
                    $$$id: 100,
                }),
                $$$partnerId: 10,
            },
            {
                $$$channelId: 1000,
                $$$partnerId: 100,
            },
        ]),
        $$$messageSeenIndicators: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$channelId: 1000,
            $$$messageId: 100,
        }),
    });
    const message = env.services.action.dispatch('Message/insert', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$displayName: "Demo User",
            $$$id: env.services.model.messaging.$$$currentPartner(this).$$$id(this),
        }),
        $$$body: "<p>Test</p>",
        $$$id: 100,
        $$$originThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    await env.services.action.dispatch('Component/mount', 'MessageSeenIndicator', { message, thread });
    assert.containsOnce(
        document.body,
        '.o-MessageSeenIndicator',
        "should display a message seen indicator component",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-MessageSeenIndicator'),
        'o-isAllSeen',
        "indicator component should not be considered as all seen",
    );
    assert.containsN(
        document.body,
        '.o-MessageSeenIndicator-icon',
        2,
        "should display two seen indicator icon",
    );
});

QUnit.test('rendering when just everyone has seen the message', async function (assert) {
    assert.expect(3);

    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/create', {
        $$$id: 1000,
        $$$model: 'mail.channel',
        $$$partnerSeenInfos: env.services.action.dispatch('RecordFieldCommand/create',[
            {
                $$$channelId: 1000,
                $$$lastFetchedMessage: env.services.action.dispatch('RecordFieldCommand/insert', {
                    $$$id: 100,
                }),
                $$$lastSeenMessage: env.services.action.dispatch('RecordFieldCommand/insert', {
                    $$$id: 100,
                }),
                $$$partnerId: 10,
            },
            {
                $$$channelId: 1000,
                $$$lastFetchedMessage: env.services.action.dispatch('RecordFieldCommand/insert', {
                    $$$id: 100,
                }),
                $$$lastSeenMessage: env.services.action.dispatch('RecordFieldCommand/insert', {
                    $$$id: 100,
                }),
                $$$partnerId: 100,
            },
        ]),
        $$$messageSeenIndicators: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$channelId: 1000,
            $$$messageId: 100,
        }),
    });
    const message = env.services.action.dispatch('Message/insert', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$displayName: "Demo User",
            $$$id: env.services.model.messaging.$$$currentPartner(this).$$$id(this),
        }),
        $$$body: "<p>Test</p>",
        $$$id: 100,
        $$$originThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    await env.services.action.dispatch('Component/mount', 'MessageSeenIndicator', { message, thread });
    assert.containsOnce(
        document.body,
        '.o-MessageSeenIndicator',
        "should display a message seen indicator component",
    );
    assert.hasClass(
        document.querySelector('.o-MessageSeenIndicator'),
        'o-isAllSeen',
        "indicator component should not considered as all seen",
    );
    assert.containsN(
        document.body,
        '.o-MessageSeenIndicator-icon',
        2,
        "should display two seen indicator icon",
    );
});

});
});
});
