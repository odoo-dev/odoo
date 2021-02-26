odoo.define('mail/static/src/components/rtc_controller/rtc_controller.js', function (require) {
'use strict';


const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');

const { Component } = owl;

class RtcController extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const rtcRoom = this.env.models['mail.chat_room'].get(props.rtcRoomLocalId);
            const mailRtc = this.env.mailRtc;
            return {
                rtcRoom: rtcRoom ? rtcRoom.__state : undefined,
                sendSound: mailRtc.sendSound,
                sendVideo: mailRtc.sendVideo,
            };
        });
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.chat_room}
     */
    get room() {
        return this.env.models['mail.chat_room'].get(this.props.rtcRoomLocalId);
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    _onClickMicrophone(ev) {
        this.env.mailRtc.toggleMicrophone();
    }

    _onClickCamera(ev) {
        this.env.mailRtc.toggleVideo();
    }

    _onClickDisconnect(ev) {
        this.env.messaging.toggleRoom();
    }

}

Object.assign(RtcController, {
    props: {
        rtcRoomLocalId: String,
    },
    template: 'mail.RtcController',
});

return RtcController;

});
