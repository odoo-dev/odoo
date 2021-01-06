odoo.define('website.editor.menu', function (require) {
'use strict';

var Dialog = require('web.Dialog');
var Widget = require('web.Widget');
var core = require('web.core');

var _t = core._t;

var EditorMenu = Widget.extend({
    template: 'website.editorbar',
    xmlDependencies: ['/website/static/src/xml/website.editor.xml'],
    events: {
        'click button[data-action=cancel]': '_onCancelClick',
    },

    /**
     * @override
     */
    start: function () {
        var self = this;
        this.$el.css({width: '100%'});
        return this.wysiwyg.attachTo($('#wrapwrap')).then(function () {
            self.trigger_up('edit_mode');
            self.$el.css({width: ''});
        });
    },
    /**
     * @override
     */
    destroy: function () {
        this.trigger_up('readonly_mode');
        this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------





});

return EditorMenu;
});
