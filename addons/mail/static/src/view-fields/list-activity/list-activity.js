/** @odoo-module alias=mail.viewFields.ListActivity **/

import KanbanActivity from 'mail.viewFields.KanbanActivity';

import { _t, _lt } from 'web.core';
import field_registry from 'web.field_registry';

const ListActivity = KanbanActivity.extend({
    template: 'mail.viewFields.ListActivity',
    events: {
        ...KanbanActivity.prototype.events,
        'click .dropdown-menu.o_activity': '_onDropdownClicked',
    },
    fieldDependencies: {
        ...KanbanActivity.prototype.fieldDependencies,
        activity_summary: { type: 'char' },
        activity_type_id: {
            relation: 'mail.activity.type',
            type: 'many2one',
        },
        activity_type_icon: { type: 'char'},
    },
    label: _lt("Next Activity"),

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     * @private
     */
    async _render() {
        await this._super(...arguments);
        // set the 'special_click' prop on the activity icon to prevent from
        // opening the record when the user clicks on it (as it opens the
        // activity dropdown instead)
        this.$('.o_activity_btn > span').prop('special_click', true);
        if (this.value.count) {
            let text;
            if (this.recordData.activity_exception_decoration) {
                text = _t("Warning");
            } else {
                text = (
                    this.recordData.activity_summary ||
                    this.recordData.activity_type_id.data.display_name
                );
            }
            this.$('.o_activity_summary').text(text);
        }
        if (this.recordData.activity_type_icon) {
            this.el.querySelector('.o_activity_btn > span').classList.replace(
                'fa-clock-o',
                this.recordData.activity_type_icon,
            );
        }
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * As we are in a list view, we don't want clicks inside the activity
     * dropdown to open the record in a form view.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onDropdownClicked(ev) {
        ev.stopPropagation();
    },
});

field_registry.add('list_activity', ListActivity);

export default ListActivity;
