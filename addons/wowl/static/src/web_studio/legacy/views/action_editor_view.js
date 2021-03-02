odoo.define('web_studio.ActionEditorView', function (require) {
"use strict";

var Widget = require('web.Widget');
var config = require('web.config');

var ActionEditorView = Widget.extend({
    template: 'web_studio.ActionEditorView',
    events: {
        'click .dropdown-item': '_onMenu',
        'click .o_web_studio_thumbnail': '_onThumbnail',
    },
    /**
     * @constructor
     * @param {Object} flags
     */
    init: function (parent, flags) {
        this._super.apply(this, arguments);
        this.debug = config.isDebug();
        this.active = flags.active;
        this.default_view = flags.default_view;
        this.view_type = flags.view_type;
        this.can_default = flags.can_default;
        this.can_be_disabled = flags.can_be_disabled;
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onThumbnail: function () {
       if (this.active) {
            this.trigger_up('studio_edit_view', {view_type: this.view_type});
        } else {
            this.trigger_up('studio_new_view', {view_type: this.view_type});
        }
    },
    /**
     * @private
     * @param {Event} event
     */
    _onMenu: function (event) {
        event.preventDefault();
        var action = $(event.currentTarget).data('action');

        var eventName;
        switch (action) {
            case 'set_default_view':
                eventName = 'studio_default_view';
                break;
            case 'restore_default_view':
                eventName = 'studio_restore_default_view';
                break;
            case 'disable_view':
                eventName = 'studio_disable_view';
                break;
        }
        if (eventName) {
            this.trigger_up(eventName, {view_type: this.view_type});
        }
    },
});

return ActionEditorView;

});
