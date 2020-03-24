odoo.define('mail.component.ActivityMarkDonePopover', function (require) {
'use strict';

const useStore = require('mail.hooks.useStore');

const { Component } = owl;
const { useDispatch, useRef } = owl.hooks;

class ActivityMarkDonePopover extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.storeDispatch = useDispatch();
        this.storeProps = useStore((state, props) => {
            const activity = state.activities[props.activityLocalId];
            return { activity };
        });
        this._feedbackTextareaRef = useRef('feedbackTextarea');
    }

    //--------------------------------------------------------------------------
    // Getters
    //--------------------------------------------------------------------------

    /**
     * @returns {String}
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
        this.trigger('o-discard-clicked');
    }

    /**
     * @private
     */
    _onClickDone() {
        const feedback = this._feedbackTextareaRef.el.value;
        this.storeDispatch('markActivityAsDone', this.props.activityLocalId, { feedback });
    }

    /**
     * @private
     */
    async _onClickDoneAndScheduleNext() {
        const feedback = this._feedbackTextareaRef.el.value;
        const action = await this.storeDispatch(
            'markActivityAsDoneAndScheduleNext',
            this.props.activityLocalId,
            { feedback }
        );
        const on_close = () => {
            this.storeDispatch('refreshChatterActivities', this.storeProps.activity.chatterLocalId);
        };
        this.env.do_action(action, { on_close });
    }
}

Object.assign(ActivityMarkDonePopover, {
    props: {
        activityLocalId: String,
    },
    template: 'mail.component.ActivityMarkDonePopover',
});

return ActivityMarkDonePopover;

});
