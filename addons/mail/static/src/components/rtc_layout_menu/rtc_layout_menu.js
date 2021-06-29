/** @odoo-module **/

import { useModels } from '@mail/component_hooks/use_models/use_models';
import { useShouldUpdateBasedOnProps } from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';

const { Component } = owl;

export class RtcLayoutMenu extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useModels();
        useShouldUpdateBasedOnProps();
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

    /**
     * @returns {mail.thread|undefined}
     */
    get thread() {
        return this.env.models['mail.thread'].get(this.props.threadLocalId);
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClickFilter(ev) {
        ev.preventDefault();
        switch (ev.target.value) {
            case 'all':
                this.userSetting.update({
                    rtcFilterVideoGrid: false,
                });
                break;
            case 'video':
                this.userSetting.update({
                    rtcFilterVideoGrid: true,
                });
                break;
        }
    }

    /**
     * @private
     */
    _onClickLayout(ev) {
        ev.preventDefault();
        this.userSetting.setRtcLayout(ev.target.value);
    }
}

Object.assign(RtcLayoutMenu, {
    props: {
        threadLocalId: String,
    },
    template: 'mail.RtcLayoutMenu',
});
