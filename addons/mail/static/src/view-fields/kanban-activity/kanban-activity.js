/** @odoo-module alias=mail.viewFields.KanbanActivity **/

import _readActivities from 'mail.utils._readActivities';
import _setDelayLabel from 'mail.utils._setDelayLabel';
import _setFileUploadId from 'mail.utils._setFileUploadId';
import BasicActivity from 'mail.viewFields.BasicActivity';

import config from 'web.config';
import { qweb } from 'web.core';
import field_registry from 'web.field_registry';
import session from 'web.session';

const KanbanActivity = BasicActivity.extend({
    template: 'mail.viewFields.KanbanActivity',
    events: {
        ...BasicActivity.prototype.events,
        'show.bs.dropdown': '_onDropdownShow',
    },
    fieldDependencies: {
        ...BasicActivity.prototype.fieldDependencies,
        activity_exception_decoration: { type: 'selection' },
        activity_exception_icon: { type: 'char' },
        activity_state: { type: 'selection' },
    },

    /**
     * @override
     */
    init(parent, name, record) {
        this._super(...arguments);
        const selection = {};
        _.each(record.fields.activity_state.selection, function (value) {
            selection[value[0]] = value[1];
        });
        this.selection = selection;
        this._setState(record);
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
     */
    _reload() {
        this.trigger_up('reload', {
            db_id: this.record_id,
            keepChanges: true,
        });
    },
    /**
     * @override
     * @private
     */
    _render() {
        // span classes need to be updated manually because the template cannot
        // be re-rendered eaasily (because of the dropdown state)
        const spanClasses = ['fa', 'fa-lg', 'fa-fw'];
        spanClasses.push(`o_activity_color_${this.activityState || 'default'}`);
        if (this.recordData.activity_exception_decoration) {
            spanClasses.push(`text-${this.recordData.activity_exception_decoration}`);
            spanClasses.push(this.recordData.activity_exception_icon);
        } else {
            spanClasses.push('fa-clock-o');
        }
        this.$('.o_activity_btn > span').removeClass().addClass(spanClasses.join(' '));
        if (this.$el.hasClass('show')) {
            // note: this part of the rendering might be asynchronous
            this._renderDropdown();
        }
    },
    /**
     * @private
     */
    async _renderDropdown() {
        this.$('.o_activity')
            .toggleClass('dropdown-menu-right', config.device.isMobile)
            .html(
                qweb.render('mail.viewFields.KanbanActivity.loading'),
            );
        let activities = await _readActivities(this, this.value.res_ids);
        activities = _setFileUploadId(activities);
        this.$('.o_activity').html(
            qweb.render(
                'mail.viewFields.KanbanActivity.dropdown',
                {
                    selection: this.selection,
                    records: _.groupBy(_setDelayLabel(activities), 'state'),
                    session,
                    widget: this,
                },
            ),
        );
        this._bindOnUploadAction(activities);
    },
    /**
     * @override
     * @private
     * @param {Object} record
     */
    _reset(record) {
        this._super(...arguments);
        this._setState(record);
    },
    /**
     * @private
     * @param {Object} record
     */
    _setState(record) {
        this.record_id = record.id;
        this.activityState = this.recordData.activity_state;
    },

    //------------------------------------------------------------
    // Handlers
    //------------------------------------------------------------

    /**
     * @private
     */
    _onDropdownShow() {
        this._renderDropdown();
    },
});

field_registry.add('kanban_activity', KanbanActivity);

export default KanbanActivity;
