/** @odoo-module alias=mail.viewFields.BasicActivity **/

import AbstractField from 'web.AbstractField';
import { qweb, _t } from 'web.core';
import { blockUI, unblockUI } from 'web.framework';

export default AbstractField.extend({
    events: {
        'change input.o_input_file': '_onFileChanged',
        'click .o_edit_activity': '_onEditActivity',
        'click .o_mark_as_done': '_onMarkActivityDone',
        'click .o_mark_as_done_upload_file': '_onMarkActivityDoneUploadFile',
        'click .o_activity_template_preview': '_onPreviewMailTemplate',
        'click .o_schedule_activity': '_onScheduleActivity',
        'click .o_activity_template_send': '_onSendMailTemplate',
        'click .o_unlink_activity': '_onUnlinkActivity',
    },
    init() {
        this._super(...arguments);
        this._draftFeedback = {};
    },

    //------------------------------------------------------------
    // Public
    //------------------------------------------------------------

    async scheduleActivity() {
        await this._openActivityForm(
            false,
            () => this._reload({ activity: true, thread: true }),
        );
    },

    //------------------------------------------------------------
    // Private
    //------------------------------------------------------------

    /**
     * @private
     * @param {Object[]} activities
     */
    _bindOnUploadAction(activities) {
        for (const activity of activities) {
            if (activity.fileuploadID) {
                $(window).on(
                    activity.fileuploadID,
                    () => {
                        unblockUI();
                        // find the button clicked and display the feedback popup on it
                        const files = Array.prototype.slice.call(arguments, 1);
                        this._markActivityDone({
                            activityID: activity.id,
                            attachmentIds: _.pluck(files, 'id')
                        }).then(
                            () => this.trigger_up('reload', { keepChanges: true }),
                        );
                    },
                );
            }
        }
    },
    /** Binds a focusout handler on a bootstrap popover
     *  Useful to do some operations on the popover's HTML,
     *  like keeping the user's input for the feedback
     *  @param {JQuery} $popoverEl: the element on which
     *    the popover() method has been called
     */
    _bindPopoverFocusout($popoverEl) {
        // Retrieve the actual popover's HTML
        const $popover = $($popoverEl.data("bs.popover").tip);
        const activityID = $popoverEl.data('activity-id');
        $popover.off('focusout');
        $popover.focusout(
            ev => {
                // outside click of popover hide the popover
                // e.relatedTarget is the element receiving the focus
                if (
                    !$popover.is(ev.relatedTarget) &&
                    !$popover.find(ev.relatedTarget).length
                ) {
                    this._draftFeedback[activityID] = $popover.find('#activity_feedback').val();
                    $popover.popover('hide');
                }
            },
        );
    },
    /**
     * Send a feedback and reload page in order to mark activity as done
     *
     * @private
     * @param {Object} param0
     * @param {integer} param0.activityID
     * @param {integer[]} [param0.attachmentIds=[]]
     * @param {string|boolean} [param0.feedback=false]
     * @return {Promise}
     */
    async _markActivityDone({
        activityID,
        attachmentIds = [],
        feedback = false,
    }) {
        await this._sendActivityFeedback(activityID, feedback, attachmentIds);
        this._reload({ activity: true, thread: true });
    },
    /**
     * Send a feedback and proposes to schedule next activity
     * previousActivityTypeID will be given to new activity to propose activity
     * type based on recommended next activity
     *
     * @private
     * @param {Object} param0
     * @param {integer} param0.activityID
     * @param {string} param0.feedback
     */
    _markActivityDoneAndScheduleNext({
        activityID,
        feedback,
    }) {
        this._rpc({
            model: 'mail.activity',
            method: 'action_feedback_schedule_next',
            args: [[activityID]],
            kwargs: {feedback: feedback},
            context: this.record.getContext(),
        }).then(
            rslt_action => {
                if (rslt_action) {
                    this.do_action(rslt_action, {
                        on_close: () => this.trigger_up('reload', { keepChanges: true }),
                    });
                } else {
                    this.trigger_up('reload', { keepChanges: true });
                }
            },
        );
    },
    /**
     * @private
     * @param {integer} id
     * @param {function} callback
     */
    async _openActivityForm(id, callback) {
        await this.do_action(
            {
                context: {
                    default_res_id: this.res_id,
                    default_res_model: this.model,
                },
                name: _t("Schedule Activity"),
                res_id: id || false,
                res_model: 'mail.activity',
                target: 'new',
                type: 'ir.actions.act_window',
                view_mode: 'form',
                views: [[false, 'form']],
            },
            { on_close: callback },
        );
    },
    /**
     * @private
     * @param {integer} activityID
     * @param {string} feedback
     * @param {integer[]} attachmentIds
     * @return {Promise}
     */
    _sendActivityFeedback(activityID, feedback, attachmentIds) {
        return this._rpc({
            model: 'mail.activity',
            method: 'action_feedback',
            args: [[activityID]],
            kwargs: {
                feedback: feedback,
                attachment_ids: attachmentIds || [],
            },
            context: this.record.getContext(),
        });
    },
    /**
     * Unbind event triggered when a file is uploaded.
     *
     * @private
     * @param {Array} activities: list of activity to unbind
     */
    _unbindOnUploadAction(activities) {
        for (const activity of activities) {
            if (activity.fileuploadID) {
                $(window).off(activity.fileuploadID);
            }
        }
    },

    //------------------------------------------------------------
    // Handlers
    //------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    async _onEditActivity(ev) {
        ev.preventDefault();
        const activityID = $(ev.currentTarget).data('activity-id');
        await this._openActivityForm(
            activityID,
            () => this._reload({ activity: true, thread: true }),
        );
    },
    /**
     * @private
     * @param {FormEvent} ev
     */
    _onFileChanged(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        const $form = $(ev.currentTarget).closest('form');
        $form.submit();
        blockUI();
    },
    /**
     * Called when marking an activity as done
     *
     * It lets the current user write a feedback in a popup menu.
     * After writing the feedback and confirm mark as done
     * is sent, it marks this activity as done for good with the feedback linked
     * to it.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onMarkActivityDone(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        const self = this;
        const $markDoneBtn = $(ev.currentTarget);
        const activityID = $markDoneBtn.data('activity-id');
        const previousActivityTypeID = $markDoneBtn.data('previous-activity-type-id') || false;
        const chainingTypeActivity = $markDoneBtn.data('chaining-type-activity');
        if ($markDoneBtn.data('toggle') === 'collapse') {
            const $actLi = $markDoneBtn.parents('.o_log_activity');
            const $panel = this.$(`#o_activity_form_${activityID}`);
            if (!$panel.data('bs.collapse')) {
                const $form = $(qweb.render('mail.viewFields.BasicActivity.feedbackForm', {
                    chaining_type: chainingTypeActivity,
                    previous_activity_type_id: previousActivityTypeID,
                }));
                $panel.append($form);
                this._onMarkActivityDoneActions($markDoneBtn, $form, activityID);
                // Close and reset any other open panels
                _.each($panel.siblings('.o_activity_form'), el => {
                    if ($(el).data('bs.collapse')) {
                        $(el).empty().collapse('dispose').removeClass('show');
                    }
                });
                // Scroll  to selected activity
                $markDoneBtn.parents('.o_activity_log_container').scrollTo($actLi.position().top, 100);
            }
            // Empty and reset panel on close
            $panel.on(
                'hidden.bs.collapse',
                () => {
                    if ($panel.data('bs.collapse')) {
                        $actLi.removeClass('o_activity_selected');
                        $panel.collapse('dispose');
                        $panel.empty();
                    }
                },
            );
            this.$('.o_activity_selected').removeClass('o_activity_selected');
            $actLi.toggleClass('o_activity_selected');
            $panel.collapse('toggle');
        } else if (!$markDoneBtn.data('bs.popover')) {
            $markDoneBtn.popover({
                container: $markDoneBtn,
                content: () => {
                    const $popover = $(qweb.render('mail.viewFields.BasicActivity.feedbackForm', {
                        chaining_type: chainingTypeActivity,
                        previous_activity_type_id: previousActivityTypeID,
                    }));
                    this._onMarkActivityDoneActions($markDoneBtn, $popover, activityID);
                    return $popover;
                },
                html: true,
                placement: 'right', // FIXME: this should work, maybe a bug in the popper lib
                template: $(window.Popover.Default.template).addClass('o_mail_activity_feedback')[0].outerHTML, // Ugly but cannot find another way
                title: _t("Feedback"),
                trigger: 'manual',
            }).on(
                'shown.bs.popover',
                function () {
                    const $popover = $($(this).data("bs.popover").tip);
                    $(".o_mail_activity_feedback.popover").not($popover).popover("hide");
                    $popover.addClass('o_mail_activity_feedback').attr('tabindex', 0);
                    $popover.find('#activity_feedback').focus();
                    self._bindPopoverFocusout($(this));
                },
            ).popover('show');
        } else {
            const popover = $markDoneBtn.data('bs.popover');
            if ($('#' + popover.tip.id).length === 0) {
               popover.show();
            }
        }
    },
    /**
    * Bind all necessary actions to the 'mark as done' form
    *
    * @private
    * @param {Object} $form
    * @param {integer} activityID
    */
    _onMarkActivityDoneActions($btn, $form, activityID) {
        $form.find('#activity_feedback').val(this._draftFeedback[activityID]);
        $form.on(
            'click',
            '.o_activity_popover_done',
            ev => {
                ev.stopPropagation();
                this._markActivityDone({
                    activityID: activityID,
                    feedback: $form.find('#activity_feedback').val(),
                });
            },
        );
        $form.on(
            'click',
            '.o_activity_popover_done_next',
            ev => {
                ev.stopPropagation();
                this._markActivityDoneAndScheduleNext({
                    activityID: activityID,
                    feedback: $form.find('#activity_feedback').val(),
                });
            },
        );
        $form.on(
            'click',
            '.o_activity_popover_discard',
            ev => {
                ev.stopPropagation();
                if ($btn.data('bs.popover')) {
                    $btn.popover('hide');
                } else if ($btn.data('toggle') === 'collapse') {
                    this.$('#o_activity_form_' + activityID).collapse('hide');
                }
            },
        );
    },
    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onMarkActivityDoneUploadFile(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const fileuploadID = $(ev.currentTarget).data('fileupload-id');
        const $input = this.$(`[target='${fileuploadID}'] > input.o_input_file`);
        $input.click();
    },
    /**
     * @private
     * @param {MouseEvent} ev
     * @returns {Promise}
     */
    _onPreviewMailTemplate(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        const templateID = $(ev.currentTarget).data('template-id');
        return this.do_action(
            {
                context: {
                    default_res_id: this.res_id,
                    default_model: this.model,
                    default_use_template: true,
                    default_template_id: templateID,
                    force_email: true,
                },
                name: _t("Compose Email"),
                res_model: 'mail.compose.message',
                target: 'new',
                type: 'ir.actions.act_window',
                views: [[false, 'form']],
            },
            {
                on_close: () => this.trigger_up('reload', { keepChanges: true }),
            },
        );
    },
    /**
     * @private
     * @param {MouseEvent} ev
     * @returns {Promise}
     */
    async _onSendMailTemplate(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        const templateID = $(ev.currentTarget).data('template-id');
        await this._rpc({
            model: this.model,
            method: 'activity_send_mail',
            args: [[this.res_id], templateID],
        });
        this._reload({
            activity: true,
            followers: true,
            thread: true,
        });
    },
    /**
     * @private
     * @param {MouseEvent} ev
     */
    async _onScheduleActivity(ev) {
        ev.preventDefault();
        await this._openActivityForm(
            false,
            () => this._reload(),
        );
    },
    /**
     * @private
     * @param {MouseEvent} ev
     * @param {Object} options
     */
    async _onUnlinkActivity(ev, options) {
        ev.preventDefault();
        const activityID = $(ev.currentTarget).data('activity-id');
        options = _.defaults(options || {}, {
            model: 'mail.activity',
            args: [[activityID]],
        });
        await this._rpc({
            model: options.model,
            method: 'unlink',
            args: options.args,
        });
        this._reload({ activity: true });
    },
});
