odoo.define('mail.messaging.component.ActivityBox', function (require) {
'use strict';

const components = {
    Activity: require('mail.messaging.component.Activity'),
};
const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;
const { useDispatch, useGetters } = owl.hooks;

class ActivityBox extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.storeDispatch = useDispatch();
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            const chatter = state.chatters[props.chatterLocalId];
            const activities = state.activities;
            let futureActivitiesCount = 0;
            let overdueActivitiesCount = 0;
            let todayActivitiesCount = 0;
            for (let activityLocalId of chatter.activityLocalIds) {
                let activity = activities[activityLocalId];
                if (activity.activityState === 'planned') {
                    futureActivitiesCount++;
                } else if (activity.activityState === 'today') {
                    todayActivitiesCount++;
                } else {
                    overdueActivitiesCount++;
                }
            }
            return {
                chatter,
                futureActivitiesCount,
                overdueActivitiesCount,
                todayActivitiesCount,
            };
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.messaging.entity.Chatter}
     */
    get chatter() {
        return this.storeProps.chatter;
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClickTitle() {
        if (this.storeProps.chatter.isActivityBoxVisible) {
            this.storeDispatch('hideChatterActivityBox', this.props.chatterLocalId);
        } else {
            this.storeDispatch('showChatterActivityBox', this.props.chatterLocalId);
        }
    }

}

Object.assign(ActivityBox, {
    components,
    props: {
        chatterLocalId: String,
    },
    template: 'mail.messaging.component.ActivityBox',
});

return ActivityBox;

});
