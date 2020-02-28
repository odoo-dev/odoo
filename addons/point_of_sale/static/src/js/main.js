odoo.define('point_of_sale.main', function(require) {
    'use strict';

    const env = require('web.env');
    const { Chrome } = require('point_of_sale.chrome');

    owl.config.mode = env.isDebug() ? 'dev' : 'prod';
    owl.Component.env = env;

    async function startPosApp(webClient) {
        await env.session.is_bound;
        env.qweb.addTemplates(env.session.owlTemplates);
        await owl.utils.whenReady();
        await webClient.setElement(document.body);
        await webClient.start();
        const chrome = new Chrome(null, { webClient });
        await chrome.mount(document.querySelector('.o_action_manager'));
        await chrome.start();
    }

    return { startPosApp };
});
