odoo.define('im_livechat.component.LivechatManager', function (require) {
'use strict';

const LivechatButton = require('im_livechat.component.LivechatButton');

const ChatWindowManager = require('mail.component.ChatWindowManager');
const useStore = require('mail.hooks.useStore');

const { Component } = owl;
const { useGetters } = owl.hooks;

class LivechatManager extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            const hasChatWindow = !!state.chatWindowManager.computed.visible.length;
            return {
                hasChatWindow,
                publicLivechat: state.publicLivechat,
            };
        });
    }

}

Object.assign(LivechatManager, {
    components: { ChatWindowManager, LivechatButton },
    template: 'im_livechat.component.LivechatManager',
});

return LivechatManager;

});
