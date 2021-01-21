odoo.define('web_editor.wysiwyg.multizone.translate', function (require) {
'use strict';

var core = require('web.core');
var webDialog = require('web.Dialog');
var WysiwygMultizone = require('web_editor.wysiwyg.multizone');
var Dialog = require('wysiwyg.widgets.Dialog');
var websiteNavbarData = require('website.navbar');

return;

var _t = core._t;

var WysiwygTranslate = WysiwygMultizone.extend({
    custom_events: _.extend({}, WysiwygMultizone.prototype.custom_events || {}, {
        ready_to_save: '_onSave',
        rte_change: '_onChange',
    }),

    /**
     * @override
     * @param {string} options.lang
     */
    init: function (parent, options) {
        this.lang = options.lang;
        options.recordInfo = _.defaults({
                context: {lang: this.lang}
            }, options.recordInfo, options);
        this._super.apply(this, arguments);
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        // Hacky way to keep the top editor toolbar in translate mode for now
        this.$webEditorTopEdit = $('<div id="web_editor-top-edit"></div>').prependTo(document.body);
        this.options.toolbarHandler = this.$webEditorTopEdit;
    },
    /**
     * @override
     */
    destroy: function () {
        this._super(...arguments);
        this.$webEditorTopEdit.remove();
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     * @returns {Boolean}
     */
    isDirty: function () {
        return this._super() || this.$editables_attribute.hasClass('o_dirty');
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Return an object describing the linked record.
     *
     * @override
     * @param {Object} options
     * @returns {Object} {res_id, res_model, xpath}
     */
    _getRecordInfo: function (options) {
        options = options || {};
        var recordInfo = this._super(options);
        var $editable = $(options.target).closest(this._getEditableArea());
        if (!$editable.length) {
            $editable = $(this._getFocusedEditable());
        }
        recordInfo.context.lang = this.lang;
        recordInfo.translation_id = $editable.data('oe-translation-id')|0;
        return recordInfo;
    },
    /**
     * @override
     * @returns {Object} the summernote configuration
     */
    _editorOptions: function () {
        var options = this._super();
        options.toolbar = [
            // todo: hide this feature for field (data-oe-model)
            ['font', ['bold', 'italic', 'underline', 'clear']],
            ['fontsize', ['fontsize']],
            ['color', ['color']],
            // keep every time
            ['history', ['undo', 'redo']],
        ];
        return options;
    },
    /**
     * Called when text is edited -> make sure text is not messed up and mark
     * the element as dirty.
     *
     * @override
     * @param {Jquery Event} [ev]
     */
    _onChange: function (ev) {
        var $node = $(ev.data.target);
        if (!$node.length) {
            return;
        }
        $node.find('div,p').each(function () { // remove P,DIV elements which might have been inserted because of copy-paste
            var $p = $(this);
            $p.after($p.html()).remove();
        });
        var trans = this._getTranlationObject($node[0]);
        $node.toggleClass('o_dirty', trans.value !== $node.html().replace(/[ \t\n\r]+/, ' '));
    },
});

return WysiwygTranslate;
});
