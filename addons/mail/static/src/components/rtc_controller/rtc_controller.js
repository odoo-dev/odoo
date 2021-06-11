/** @odoo-module **/

import useRefs from '@mail/component_hooks/use_refs/use_refs';
import useStore from '@mail/component_hooks/use_store/use_store';

const { Component } = owl;

class RtcController extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const mailRtc = this.env.mailRtc;
            const messaging = this.env.messaging;
            return {
                activeCallThreadLocalId: messaging.activeCallThreadLocalId,
                isDeaf: mailRtc.isDeaf,
                isSettingWindowOpen: messaging.userSetting.isOpen,
                sendDisplay: mailRtc.sendDisplay,
                sendSound: mailRtc.sendSound,
                sendUserVideo: mailRtc.sendUserVideo,
                showMemberList: messaging.showMemberList,
            };
        });
        this._getRefs = useRefs();
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.thread}
     */
    get thread() {
        return this.env.models['mail.thread'].get(this.props.threadLocalId || this.env.messaging.activeCallThreadLocalId);
    }

    /**
     * @returns {boolean}
     */
    get isCurrentActiveCall() {
        return this.env.messaging.activeCallThreadLocalId &&
         (!this.props.threadLocalId || this.props.threadLocalId === this.env.messaging.activeCallThreadLocalId)
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    _onClickDeafen(ev) {
        this.env.mailRtc.toggleDeaf();
    }

    _onClickMembers(ev) {
        this.env.messaging.toggleMemberList();
    }

    _onClickMicrophone(ev) {
        this.env.mailRtc.toggleMicrophone();
    }

    _onClickCamera(ev) {
        this.env.mailRtc.toggleUserVideo();
    }

    _onClickSettings(ev) {
        this.env.messaging.userSetting.toggleWindow();
    }

    _onClickScreen(ev) {
        this.env.mailRtc.toggleScreenShare();
    }

    async _onClickPhone(ev) {
        await this.env.messaging.toggleCall({
            threadLocalId: this.props.threadLocalId,
        });
    }
}

Object.assign(RtcController, {
    props: {
        threadLocalId: {
            type: String,
            optional: true, // if not defined, represents the current active call
        },
        showMembersButton: {
            type: Boolean,
            optional: true,
        }
    },
    template: 'mail.RtcController',
});

export default RtcController;
