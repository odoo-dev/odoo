/** @odoo-module alias=mail.views.activity.Record **/

import KanbanRecord from 'web.KanbanRecord';

const ActivityRecord = KanbanRecord.extend({
    /**
     * @override
     */
    init(parent, state) {
        this._super(...arguments);
        this.fieldsInfo = state.fieldsInfo.activity;
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     * @private
     */
    async _render() {
        this.defs = [];
        this._replaceElement(this.qweb.render('activity-box', this.qweb_context));
        this.$el.on('click', this._onGlobalClick.bind(this));
        this.$el.addClass('o_activity_record');
        this._processFields();
        this._setupColor();
        await Promise.all(this.defs);
    },
    /**
     * @override
     * @private
     */
    _setFieldDisplay($el, fieldName) {
        this._super(...arguments);
        // attribute muted
        if (this.fieldsInfo[fieldName].muted) {
            $el.addClass('text-muted');
        }
    },
    /**
     * @override
     * @private
     */
    _setState() {
        this._super(...arguments);
        // activity has a different qweb context
        this.qweb_context = {
            activity_image: this._getImageURL.bind(this),
            record: this.record,
            user_context: this.getSession().user_context,
            widget: this,
        };
    },
});

export default ActivityRecord;
