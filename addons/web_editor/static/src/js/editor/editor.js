odoo.define('web_editor.editor', function (require) {
'use strict';

var Dialog = require('web.Dialog');
var Widget = require('web.Widget');
var core = require('web.core');
var snippetsEditor = require('web_editor.snippet.editor');
var summernoteCustomColors = require('web_editor.custom_colors');

var _t = core._t;

var EditorMenuBar = Widget.extend({
    template: 'web_editor.editorbar',
    xmlDependencies: ['/web_editor/static/src/xml/editor.xml'],
    custom_events: {
        request_editable: '_onRequestEditable',
    },

    /**
     * @override
     */
    start: function () {
        var self = this;
        var defs = [this._super.apply(this, arguments)];

        // $('.dropdown-toggle').dropdown();

        // $(document).on('keyup', function (event) {
        //     if ((event.keyCode === 8 || event.keyCode === 46)) {
        //         var $target = $(event.target).closest('.o_editable');
        //         if (!$target.is(':has(*:not(p):not(br))') && !$target.text().match(/\S/)) {
        //             $target.empty();
        //         }
        //     }
        // });
        // $(document).on('click', '.note-editable', function (ev) {
        //     ev.preventDefault();
        // });
        // $(document).on('submit', '.note-editable form .btn', function (ev) {
        //     ev.preventDefault(); // Disable form submition in editable mode
        // });
        // $(document).on('hide.bs.dropdown', '.dropdown', function (ev) {
        //     // Prevent dropdown closing when a contenteditable children is focused
        //     if (ev.originalEvent
        //             && $(ev.target).has(ev.originalEvent.target).length
        //             && $(ev.originalEvent.target).is('[contenteditable]')) {
        //         ev.preventDefault();
        //     }
        // });

        // this.rte.start();

        // var flag = false;
        // window.onbeforeunload = function (event) {
        //     if (rte.history.getEditableHasUndo().length && !flag) {
        //         flag = true;
        //         _.defer(function () { flag=false; });
        //         return _t('This document is not saved!');
        //     }
        // };

        // Snippets menu
        // if (self.snippetsMenu) {
        //     defs.push(this.snippetsMenu.insertAfter(this.$el));
        // }
        // this.rte.editable().find('*').off('mousedown mouseup click');

        // return Promise.all(defs).then(function () {
        //     self.trigger_up('edit_mode');
        // });
    },
    /**
     * @override
     */
    // destroy: function () {
    //     this._super.apply(this, arguments);
    //     // core.bus.off('editor_save_request', this, this._onSaveRequest);
    //     // core.bus.off('editor_discard_request', this, this._onDiscardRequest);
    // },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    // /**
    //  * Called when the "Discard" button is clicked -> discards the changes.
    //  *
    //  * @private
    //  */
    // _onCancelClick: function () {
    //     this.cancel();
    // },
    // /**
    //  * Called when an element askes to record an history undo -> records it.
    //  *
    //  * @private
    //  * @param {OdooEvent} ev
    //  */
    // _onHistoryUndoRecordRequest: function (ev) {
    //     this.rte.historyRecordUndo(ev.data.$target, ev.data.event);
    // },
    // /**
    //  * Called when the "Save" button is clicked -> saves the changes.
    //  *
    //  * @private
    //  */
    // _onSaveClick: function () {
    //     this.save();
    // },
    // /**
    //  * Called when a discard request is received -> discard the page content
    //  * changes.
    //  *
    //  * @private
    //  * @param {OdooEvent} ev
    //  */
    // // _onDiscardRequest: function (ev) {
    // //     this.cancel(ev.data.reload).then(ev.data.onSuccess, ev.data.onFailure);
    // // },
    // /**
    //  * @private
    //  * @param {OdooEvent} ev
    //  */
    // _onRequestEditable: function (ev) {
    //     ev.data.callback(this.rte.editable());
    // },
});

return {
    Class: EditorMenuBar,
};
});
