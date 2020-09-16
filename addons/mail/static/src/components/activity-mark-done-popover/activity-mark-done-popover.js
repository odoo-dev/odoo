/** @odoo-module alias=mail.components.ActivityMarkDonePopover **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component } = owl;
const { useRef } = owl.hooks;

class ActivityMarkDonePopover extends usingModels(Component) {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this._feedbackTextareaRef = useRef('feedbackTextarea');
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    mounted() {
        this._feedbackTextareaRef.el.focus();
        if (this.activity.feedbackBackup(this)) {
            this._feedbackTextareaRef.el.value = this.activity.feedbackBackup(this);
        }
    }

    /**
     * @returns {string}
     */
    get DONE_AND_SCHEDULE_NEXT() {
        return this.env._t("Done & Schedule Next");
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _close() {
        this.trigger('o-popover-close');
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onBlur() {
        this.env.services.action.dispatch(
            'Record/update',
            this.activity,
            { feedbackBackup: this._feedbackTextareaRef.el.value },
        );
    }

    /**
     * @private
     */
    _onClickDiscard() {
        this._close();
    }

    /**
     * @private
     */
    async _onClickDone() {
        await this.env.services.action.dispatch(
            'Activity/markAsDone',
            this.activity,
            { feedback: this._feedbackTextareaRef.el.value },
        );
        this.trigger('reload', { keepChanges: true });
    }

    /**
     * @private
     */
    _onClickDoneAndScheduleNext() {
        this.env.services.action.dispatch(
            'Activity/markAsDoneAndScheduleNext',
            this.activity,
            { feedback: this._feedbackTextareaRef.el.value },
        );
    }

    /**
     * @private
     */
    _onKeydown(ev) {
        if (ev.key === 'Escape') {
            this._close();
        }
    }

}

Object.assign(ActivityMarkDonePopover, {
    props: {
        activity: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Activity') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'mail.ActivityMarkDonePopover',
});

export default ActivityMarkDonePopover;
