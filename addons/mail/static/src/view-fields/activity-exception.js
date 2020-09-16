/** @odoo-module alias=mail.viewFields.ListActivity **/

import AbstractField from 'web.AbstractField';
import { _t } from 'web.core';
import field_registry from 'web.field_registry';

// -----------------------------------------------------------------------------
// Activity Exception Widget to display Exception icon ('activity_exception' widget)
// -----------------------------------------------------------------------------

const ActivityException = AbstractField.extend({
    noLabel: true,
    fieldDependencies: {
        ...AbstractField.prototype.fieldDependencies,
        activity_exception_icon: { type: 'char' },
    },

    //------------------------------------------------------------
    // Private
    //------------------------------------------------------------

    /**
     * There is no edit mode for this widget, the icon is always readonly.
     *
     * @override
     * @private
     */
    _renderEdit() {
        return this._renderReadonly();
    },

    /**
     * Displays the exception icon if there is one.
     *
     * @override
     * @private
     */
    _renderReadonly() {
        this.$el.empty();
        if (this.value) {
            this.$el.attr({
                title: _t("This record has an exception activity."),
                class: `pull-right mt-1 text-${this.value} fa ${this.recordData.activity_exception_icon}`,
            });
        }
    }
});

field_registry.add('activity_exception', ActivityException);

export default ActivityException;
