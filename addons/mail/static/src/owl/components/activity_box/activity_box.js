odoo.define('mail.component.ActivityBox', function (require) {
'use strict';

const Activity = require('mail.component.Activity');
const useStore = require('mail.hooks.useStore');

const { Component } = owl;
const { useDispatch, useGetters } = owl.hooks;

class ActivityBox extends Component {

    /**
     * @override
     * @param {...any} args
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
    components: { Activity },
    props: {
        chatterLocalId: String,
    },
    template: 'mail.component.ActivityBox',
});

return ActivityBox;

});
