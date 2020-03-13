odoo.define('im_livechat.main', function (require) {

const LivechatManager = require('im_livechat.component.LivechatManager');

const { getMessagingEnv } = require('mail.messaging.env');

const publicEnv = require('web.public_env');
var time = require('web.time');

const messagingEnv = getMessagingEnv('main', publicEnv);
messagingEnv.rpc = publicEnv.services.rpc;
messagingEnv.hasComposerAttachments = false;
messagingEnv.hasComposerEmojis = false;
messagingEnv.hasFontAwesome = false;
messagingEnv.isMessagePartnerDisplayNamePreferred = true;

Object.assign(messagingEnv.store.actions, {
    /**
     * @override
     */
    closeChatWindow({ env }) {
        messagingEnv.store.actions.closeChatWindow(...arguments);
        env.services.setCookie('im_livechat_session', "", -1); // remove cookie
    },
    /**
     * Initiates the public livechat by fetching the chat history (if it exists)
     * or the channel info otherwise.
     *
     * @param {Object} param0
     * @param {function} param0.dispatch
     * @param {Object} param0.env
     * @param {Object} param0.state
     * @param {Object} param1
     */
    async initPublicLivechat({ dispatch, env, state }, {
        button_background_color,
        button_text,
        button_text_color,
        channel_id,
        channel_name,
        default_message,
        header_background_color,
        input_placeholder,
        title_color,
    }) {
        var operatorCookie = env.services.getCookie('im_livechat_previous_operator_pid');
        const previousOperatorLocalId = operatorCookie
            ? dispatch('_insertPartner', { id: operatorCookie })
            : undefined;

        Object.assign(state.chatWindowManager, {
            header_background_color,
            title_color,
        });
        state.publicLivechat = {
            autoPopupTimeout: undefined,
            button_background_color,
            button_text,
            button_text_color,
            channel_id,
            channel_name,
            default_message,
            default_username: env._t("Visitor"),
            history: {},
            input_placeholder,
            previousOperatorLocalId,
            result: {
                available_for_me: false,
                rule: {
                    action: 'display_button',
                    auto_popup_timer: 0,
                    regex_url: '/im_livechat/',
                },
            },
        };
        var sessionCookie = env.services.getCookie('im_livechat_session');
        if (!sessionCookie) {
            const result = await env.rpc({
                route: '/im_livechat/init',
                params: {
                    channel_id: channel_id,
                },
            });
            Object.assign(state.publicLivechat, { result });

            if (!state.isMobile && state.publicLivechat.result.rule.action === 'auto_popup') {
                var autoPopupCookie = env.services.getCookie('im_livechat_auto_popup');
                if (!autoPopupCookie || JSON.parse(autoPopupCookie)) {
                    state.publicLivechat.autoPopupTimeout = setTimeout(() => {
                        dispatch('openPublicLivechat');
                    }, state.publicLivechat.result.rule.auto_popup_timer * 1000);
                }
            }
        } else {
            var channel = JSON.parse(sessionCookie);
            const history = await env.rpc({
                route: '/mail/chat_history',
                params: {
                    uuid: channel.uuid,
                    limit: 100,
                },
            });
            for (const data of history) {
                dispatch('_insertMessage', data);
            }
            dispatch('openPublicLivechat');
        }
        dispatch('_initBusNotifications');
    },
    /**
     * Opens the public livechat if there is an operator available, by fetching
     * the chat history (if it exists) or the channel info otherwise.
     *
     * @param {Object} param0
     * @param {function} param0.dispatch
     * @param {Object} param0.env
     * @param {Object} param0.state
     */
    async openPublicLivechat({ dispatch, env, state }) {
        clearTimeout(state.publicLivechat.autoPopupTimeout);
        state.publicLivechat.autoPopupTimeout = undefined;
        const previousOperator = state.publicLivechat.previousOperatorLocalId
            ? state.partners[state.publicLivechat.previousOperatorLocalId]
            : undefined;
        var cookie = env.services.getCookie('im_livechat_session');
        let livechatData;
        if (cookie) {
            livechatData = JSON.parse(cookie);
        } else {
            livechatData = await env.rpc({
                route: '/im_livechat/get_session',
                params: {
                    channel_id: state.publicLivechat.channel_id,
                    anonymous_name: state.publicLivechat.default_username,
                    previous_operator_id: previousOperator && previousOperator.id,
                },
                settings: {
                    shadow: true,
                },
            });
            if (!livechatData) {
                // TODO SEB test this
                env.displayNotification({
                    title: env._t("Collaborators offline"),
                    message: env._t("None of our collaborators seem to be available, please try again later."),
                    sticky: true
                });
                return;
            }
        }

        // fill store
        const operatorLocalId = dispatch('_insertPartner', {
            id: livechatData.operator_pid[0],
            display_name: livechatData.operator_pid[1],
        });
        const threadLocalId = dispatch('insertThread', Object.assign({
            _model: 'mail.channel',
        }, livechatData));
        const thread = state.threads[threadLocalId];

        env.services.setCookie('im_livechat_session', JSON.stringify({
            folded: thread.folded,
            id: thread.id,
            message_unread_counter: thread.message_unread_counter,
            operator_pid: thread.operator_pid,
            name: thread.name,
            uuid: thread.uuid,
        }), 60 * 60);

        // subscribe to updates
        env.services.bus_service.addChannel(thread.uuid);

        // TODO SEB: if not history
        if (state.publicLivechat.default_message) {
            const operator = state.partners[operatorLocalId];
            dispatch('_createMessage', {
                id: '_welcome',
                author_id: [operator.id, operator.display_name],
                body: _.str.sprintf('<p>%s</p>', state.publicLivechat.default_message),
                channel_ids: [thread.id],
                date: time.datetime_to_str(new Date()),
            });
        }
        dispatch('openThread', threadLocalId);
    },
    /**
     * There is a different "post" flow for livechat.
     *
     * @override
     */
    async postMessage(
        { dispatch, env, getters, state },
        composerLocalId,
        data,
        options
    ) {
        const composer = state.composers[composerLocalId];
        const thread = state.threads[composer.threadLocalId];
        const messageId = await env.rpc({
            route: '/mail/chat_post',
            params: {
                message_content: composer.textInputContent,
                uuid: thread.uuid,
            },
        });
        if (!messageId) {
            // self.displayNotification({
            //     title: _t("Session Expired"),
            //     message: _t("You took to long to send a message. Please refresh the page and try again."),
            //     sticky: true,
            // });
            // self._closeChat();
        } else {
            dispatch('_resetComposer', composerLocalId);
        }
    },
    /**
     * Messages are fetched through "history" for livechat.
     *
     * @override
     */
    async _loadMessagesOnThread(
        { dispatch, env, state },
        threadLocalId,
        param2,
    ) {
        dispatch('_handleThreadLoaded', threadLocalId, {
            messagesData: [],
        });
    },
    /**
     * TODO SEB most notifications should be ignored on the public part to
     * avoid broken features such as partially working chat window opening on
     * new message. Or make them work correctly instead. Condition should be on
     * whether the user has backend access.
     *
     * @override
     */
    // async _handleNotifications(...args) {},
    /**
     * There is no server sync for livechat.
     *
     * @override
     */
    async _notifyServerThreadIsMinimized({ env, state }, threadLocalId) {},
        /**
     * There is no server sync for livechat.
     *
     * @override
     */
    async _notifyServerThreadState({ env, state }, threadLocalId) {},
});

async function init(url, options) {
    // load qweb templates
    const templatesProm = messagingEnv.rpc({
        route: '/im_livechat/load_templates',
    }).then(templatesList => {
        const owlTemplates = [];
        templatesList.forEach(template => {
            const doc = new DOMParser().parseFromString(template, 'text/xml');
            for (let child of doc.querySelectorAll("templates > [owl]")) {
                child.removeAttribute('owl');
                owlTemplates.push(child.outerHTML);
                child.remove();
            }
        });
        messagingEnv.qweb.addTemplates(`<templates> ${owlTemplates.join('\n')} </templates>`);
    });

    // init state
    const initProm = messagingEnv.store.dispatch('initPublicLivechat', options);

    // when everything is ready: mount component
    await Promise.all([templatesProm, initProm]);
    LivechatManager.env = messagingEnv;
    const livechatManager = new LivechatManager(null, options);
    livechatManager.mount(document.body);

    var rootWidget = require('root.widget');
    var im_livechat = require('im_livechat.im_livechat');
    var button = new im_livechat.LivechatButton(rootWidget, url, options);
    button.appendTo(document.body);
}

return { init };

});
