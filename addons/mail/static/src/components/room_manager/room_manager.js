odoo.define('mail/static/src/components/room_manager/room_manager.js', function (require) {
'use strict';

const components = {
    VideoRoom: require('mail/static/src/components/video_room/video_room.js'),
};

const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');

const { Component, useState } = owl;

const ajax = require('web.ajax');

class RoomManager extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        /*
        useStore(props => {
            const chatRooms = this.env.models['mail.chat_room'].all();
            return {
                chatRooms: chatRooms.map(chatRoom => chatRoom.__state),
                partnerRoot: this.env.messaging.partnerRoot,
            };
        });
        */
        this.state = useState({
            peerToken: undefined,
            roomLocalId: undefined,
        });
    }

    async willStart() {
        await this._loadAssets();
        // to move to a button
        const { peerToken, roomData } = await this.env.services.rpc({
            route: '/mail/room/join/',
            params: {
                room_token: 'demo-token',
            },
        });
        const room = this.env.models['mail.chat_room'].insert([
            this.env.models['mail.chat_room'].convertData(roomData)
        ]);
        this.state.peerToken = peerToken;
        this.state.roomLocalId = room[0].localId;
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * To be overwritten in tests.
     *
     * @private
     */
    async _loadAssets() {
        const asset = await ajax.loadAsset('mail.peer_js_assets');
        await ajax.loadLibs(asset);
    }
}

Object.assign(RoomManager, {
    components,
    props: {},
    template: 'mail.RoomManager',
});

return RoomManager;

});
