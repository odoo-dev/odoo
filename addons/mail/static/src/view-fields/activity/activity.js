/** @odoo-module alias=mail.viewFields.Activity **/

import _setDelayLabel from 'mail.utils._setDelayLabel';
import _setFileUploadId from 'mail.utils._setFileUploadId';
import addLink from 'mail.utils.addLink';
import inline from 'mail.utils.inline';
import parseAndTransform from 'mail.utils.parseAndTransform';
import BasicActivity from 'mail.viewFields.BasicActivity';

import { qweb } from 'web.core';
import session from 'web.session';
import { getLangDateFormat, getLangDatetimeFormat } from 'web.time';

export default BasicActivity.extend({
    className: 'o_mail_activity',
    events: {
        ...BasicActivity.prototype.events,
        'click a': '_onClickRedirect',
    },
    specialData: '_fetchSpecialActivity',
    /**
     * @override
     */
    init() {
        this._super(...arguments);
        this._activities = this.record.specialData[this.name];
    },
    /**
     * @override
     */
    destroy() {
        this._unbindOnUploadAction();
        return this._super(...arguments);
    },

    //------------------------------------------------------------
    // Private
    //------------------------------------------------------------
    /**
     * @private
     * @param {Object} fieldsToReload
     */
    _reload(fieldsToReload) {
        this.trigger_up('reload_mail_fields', fieldsToReload);
    },
    /**
     * @override
     * @private
     */
    _render() {
        for (const activity of this._activities) {
            const note = parseAndTransform(activity.note || '', inline);
            const is_blank = (/^\s*$/).test(note);
            if (!is_blank) {
                activity.note = parseAndTransform(activity.note, addLink);
            } else {
                activity.note = '';
            }
        }
        const activities = _setFileUploadId(_setDelayLabel(this._activities));
        if (activities.length) {
            const  nbActivities = _.countBy(activities, 'state');
            this.$el.html(
                qweb.render(
                    'mail.viewFields.Activity.items',
                    {
                        activities,
                        dateFormat: getLangDateFormat(),
                        datetimeFormat: getLangDatetimeFormat(),
                        nbOverdueActivities: nbActivities.overdue,
                        nbPlannedActivities: nbActivities.planned,
                        nbTodayActivities: nbActivities.today,
                        session,
                        uid: session.uid,
                        widget: this,
                    },
                ),
            );
            this._bindOnUploadAction(this._activities);
        } else {
            this._unbindOnUploadAction(this._activities);
            this.$el.empty();
        }
    },
    /**
     * @override
     * @private
     * @param {Object} record
     */
    _reset(record) {
        this._super(...arguments);
        this._activities = this.record.specialData[this.name];
        // the mail widgets being persistent, one need to update the res_id on reset
        this.res_id = record.res_id;
    },

    //------------------------------------------------------------
    // Handlers
    //------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickRedirect(ev) {
        const id = $(ev.currentTarget).data('oe-id');
        if (id) {
            ev.preventDefault();
            const model = $(ev.currentTarget).data('oe-model');
            this.trigger_up('redirect', {
                res_id: id,
                res_model: model,
            });
        }
    },

});
