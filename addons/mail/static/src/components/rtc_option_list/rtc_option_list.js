/** @odoo-module **/

import { useRefs } from '@mail/component_hooks/use_refs/use_refs';
import { useModels } from '@mail/component_hooks/use_models/use_models';
import { useShouldUpdateBasedOnProps } from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';

const { Component } = owl;

export class RtcOptionList extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useModels();
        useShouldUpdateBasedOnProps();
        this._getRefs = useRefs();
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickFullScreen(ev) {
        this.env.messaging.userSetting.toggleFullScreen();
        this.trigger('o-popover-close');
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickLayout(ev) {
        this.env.messaging.userSetting.toggleLayoutSettingsWindow();
        this.trigger('o-popover-close');
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickOptions(ev) {
        this.env.messaging.userSetting.rtcConfigurationMenu.toggle();
        this.trigger('o-popover-close');
    }

}

Object.assign(RtcOptionList, {
    props: {},
    template: 'mail.RtcOptionList',
});
