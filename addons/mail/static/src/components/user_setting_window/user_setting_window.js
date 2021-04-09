/** @odoo-module **/

import useStore from '@mail/component_hooks/use_store/use_store';

const { Component } = owl;
const { useState } = owl.hooks;

class UserSettingWindow extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const userSetting = this.env.messaging.userSetting;
            return {
                pushToTalkKey: userSetting.pushToTalkKey,
                usePushToTalk: userSetting.usePushToTalk,
                voiceActivationThreshold: userSetting.voiceActivationThreshold,
                voiceActiveDuration: userSetting.voiceActiveDuration,
            };
        });
        this.state = useState({
            isRegisteringKey: false,
        });
        this._onKeyDown = this._onKeyDown.bind(this);
    }

    mounted() {
        window.addEventListener('keydown', this._onKeyDown);
    }

    willUnmount() {
        window.removeEventListener('keydown', this._onKeyDown);
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.user_setting}
     */
    get userSetting() {
        return this.env.messaging.userSetting;
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    _onKeyDown(ev) {
        if (!this.state.isRegisteringKey) {
            return;
        }
        this.userSetting.savePushToTalkKey(ev.key);
        this.state.isRegisteringKey = false;
    }

    _onChangePushToTalk(ev) {
        if (this.userSetting.usePushToTalk) {
            this.state.isRegisteringKey = false;
        }
        this.userSetting.togglePushToTalk();
    }

    _onClickPushToTalk(ev) {
        if (this.userSetting.usePushToTalk) {
            this.state.isRegisteringKey = false;
        }
        this.userSetting.togglePushToTalk();
    }

    _onThresholdChange(ev) {
        this.userSetting.setThresholdValue(ev.target.value);
    }

    _onDelayChange(ev) {
        this.userSetting.setDelayValue(ev.target.value);
    }

    _onCLickKeyboard(ev) {
        this.state.isRegisteringKey = !this.state.isRegisteringKey;
    }
}

Object.assign(UserSettingWindow, {
    template: 'mail.UserSettingWindow',
});

export default UserSettingWindow;
