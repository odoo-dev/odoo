/** @odoo-module **/

import { registerMessagingComponent } from '@mail/utils/messaging_component';

import Popover from "web.Popover";

const { Component } = owl;

export class Activity extends Component {

    /**
     * @returns {ActivityView}
     */
    get activityView() {
        return this.messaging && this.messaging.models['ActivityView'].get(this.props.localId);
    }

}

Object.assign(Activity, {
    props: { localId: String },
    template: 'mail.Activity',
    components: { Popover },
});

registerMessagingComponent(Activity);
