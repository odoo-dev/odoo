odoo.define('mail.messaging.component.ActivityMarkDonePopover', function (require) {
'use strict';

const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;
const { useRef } = owl.hooks;

class ActivityMarkDonePopover extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const activity = this.env.entities.Activity.get(props.activityLocalId);
            return {
                activity: activity ? activity.__state : undefined,
            };
        });
        this._feedbackTextareaRef = useRef('feedbackTextarea');
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.messaging.entity.Activity}
     */
    get activity() {
        return this.env.entities.Activity.get(this.props.activityLocalId);
    }

    /**
     * @returns {string}
     */
    get DONE_AND_SCHEDULE_NEXT() {
        return this.env._t("Done & Schedule Next");
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClickDiscard() {
        this.trigger('o-popover-close');
    }

    /**
     * @private
     */
    _onClickDone() {
        this.activity.markAsDone({
            feedback: this._feedbackTextareaRef.el.value,
        });
    }

    /**
     * @private
     */
    _onClickDoneAndScheduleNext() {
        this.activity.markAsDoneAndScheduleNext({
            feedback: this._feedbackTextareaRef.el.value,
        });
    }

}

Object.assign(ActivityMarkDonePopover, {
    props: {
        activityLocalId: String,
    },
    template: 'mail.messaging.component.ActivityMarkDonePopover',
});

return ActivityMarkDonePopover;

});
