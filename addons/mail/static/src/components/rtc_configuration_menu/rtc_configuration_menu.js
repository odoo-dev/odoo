/** @odoo-module **/

import { browser } from "@web/core/browser/browser";

import { useModels } from '@mail/component_hooks/use_models/use_models';
import { useShouldUpdateBasedOnProps } from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';

const { Component } = owl;
const { useState } = owl.hooks;

export class RtcConfigurationMenu extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useModels();
        useShouldUpdateBasedOnProps();
        this.state = useState({
            userDevices: undefined,
        });
    }

    async willStart() {
        this.state.userDevices = await browser.navigator.mediaDevices.enumerateDevices();
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.configuration_menu}
     */
    get rtcConfigurationMenu() {
        return this.env.messaging && this.env.messaging.userSetting.rtcConfigurationMenu;
    }

    /**
     * @returns {mail.user_setting}
     */
    get userSetting() {
        return this.env.messaging && this.env.messaging.userSetting;
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onChangeDelay(ev) {
        this.rtcConfigurationMenu.onChangeDelay(ev.target.value);
    }

    /**
     * @private
     * @param {Event} ev
     */
    _onChangePushToTalk(ev) {
        this.rtcConfigurationMenu.onChangePushToTalk();
    }

    /**
     * @private
     * @param {Event} ev
     */
    _onChangeSelectAudioInput(ev) {
        this.rtcConfigurationMenu.onChangeSelectAudioInput(ev.target.value);
    }

    /**
     * @private
     * @param {Event} ev
     */
    _onChangeThreshold(ev) {
        this.rtcConfigurationMenu.onChangeThreshold(ev.target.value);
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onCLickRegisterKeyButton() {
        this.rtcConfigurationMenu.onCLickRegisterKeyButton();
    }
}

Object.assign(RtcConfigurationMenu, {
    template: 'mail.RtcConfigurationMenu',
});
