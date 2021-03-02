odoo.define('web_studio.FormEditorHook', function (require) {
"use strict";

var Widget = require('web.Widget');

var FormEditorHook = Widget.extend({
    className: 'o_web_studio_hook',
    /**
     * @constructor
     * @param {Widget} parent
     * @param {String} position values: inside | after | before
     * @param {Integer} hook_id
     * @param {String} tagName values: generidTag | '' | tr | div
     */
    init: function (parent, position, hook_id, tagName) {
        this._super.apply(this, arguments);
        this.position = position;
        this.hook_id = hook_id;
        this.tagName = tagName || 'div';
    },
    /**
     * @override
     */
    start: function () {
        this.$el.data('hook_id', this.hook_id);

        var $content;
        switch (this.tagName) {
            case 'tr':
                $content = $('<td colspan="2">').append(this._renderSpan());
                break;
            default:
                $content = this._renderSpan();
                break;
        }
        this.$el.append($content);

        return this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @returns {JQuery}
     */
    _renderSpan: function () {
        return $('<span>').addClass('o_web_studio_hook_separator');
    },
});

return FormEditorHook;

});
