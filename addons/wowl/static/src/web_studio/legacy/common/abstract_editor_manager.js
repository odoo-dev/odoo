odoo.define('web_studio.AbstractEditorManager', function (require) {
"use strict";

var concurrency = require('web.concurrency');
var core = require('web.core');
var Widget = require('web.Widget');

var bus = require('web_studio.bus');
var XMLEditor = require('web_studio.XMLEditor');

var _lt = core._lt;
var _t = core._t;

var AbstractEditorManager = Widget.extend({
    className: 'o_web_studio_editor_manager',
    custom_events: {
        close_xml_editor: '_onCloseXMLEditor',
        drag_component: '_onDragComponent',
        node_clicked: '_onNodeClicked',
        open_xml_editor: '_onOpenXMLEditor',
        save_xml_editor: '_onSaveXMLEditor',
        sidebar_tab_changed: '_onSidebarTabChanged',
        studio_error: '_onStudioError',
        view_change: '_onViewChange',
    },
    error_messages: {
        wrong_xpath: _lt("This operation caused an error, probably because a xpath was broken"),
        view_rendering: _lt("The requested change caused an error in the view. It could be because a field was deleted, but still used somewhere else."),
    },
    /**
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);

        this.editor = undefined;
        this.sidebar = undefined;
        this.sidebarScrollTop = undefined;

        this.mode = 'edition';  // the other mode is 'rendering' in XML editor

        this.operations = [];
        this.operations_undone = [];

        this.mdp = new concurrency.MutexedDropPrevious();

        bus.on('undo_clicked', this, this._undo);
        bus.on('redo_clicked', this, this._redo);
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            return self._instantiateEditor().then(function (editor) {
                var defs = [];
                var $editorFragment = $('<div>', {
                    class: 'o_web_studio_view_renderer',
                });
                self.editor = editor;
                if (self.editor instanceof owl.Component) {
                    defs.push(self.editor.mount($editorFragment[0]));
                } else {
                    defs.push(self.editor.appendTo($editorFragment));
                }
                // TODO: is that correct? shouldn't this be done in then the
                // appendTo
                $editorFragment.appendTo(self.$el);

                self.sidebar = self._instantiateSidebar();
                defs.push(self.sidebar.prependTo(self.$el));
                return Promise.all(defs);
            });
        });
    },
    /**
     * @override
     */
    destroy: function () {
        bus.trigger('undo_not_available');
        bus.trigger('redo_not_available');
        this._super.apply(this, arguments);
    },
    /**
     * Called each time the view editor manager is attached to the DOM. This is
     * important for the graph editor, which only renders itself when it is in
     * the DOM
     *
     */
    on_attach_callback: function () {
        if (this.editor && this.editor.on_attach_callback) {
            this.editor.on_attach_callback();
        }
        this.isInDOM = true;
    },
    /**
     * Called each time the view editor manager is detached from the DOM.
     *
     */
    on_detach_callback: function () {
        if (this.editor && this.editor.on_detach_callback) {
            this.editor.on_detach_callback();
        }
        this.isInDOM = false;
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Apply the changes, i.e. the stack of operations on the Studio view.
     *
     * @param {Boolean} remove_last_op
     * @param {Boolean} from_xml
     * @returns {Promise}
     */
    _applyChanges: function (remove_last_op, from_xml) {
        var self = this;

        var lastOp = this.operations.slice(-1)[0];
        var lastOpID = lastOp && lastOp.id;

        bus.trigger('toggle_snack_bar', 'saving');

        var def;
        if (from_xml) {
            def = this.mdp.exec(this._editViewArch.bind(
                this,
                lastOp.view_id,
                lastOp.new_arch
            )).guardedCatch(function () {
                self.trigger_up('studio_error', {error: 'view_rendering'});
            });
        } else {
            def = this.mdp.exec(function () {
                var serverOperations = [];
                _.each(self.operations, function (op) {
                    if (op.type !== 'replace_arch') {
                        serverOperations.push(_.omit(op, 'id'));
                    }
                });
                var prom = self._editView(
                    self.view_id,
                    self.studio_view_arch,
                    serverOperations
                );
                prom.guardedCatch(function () {
                    self.trigger_up('studio_error', {error: 'wrong_xpath'});
                    return self._undo(lastOpID, true).then(function () {
                        return Promise.reject();
                    });
                });
                return prom;
            });
        }
        return def
            .then(function (result) {
                if (from_xml) {
                    self._cleanOperationsStack(lastOp);
                }
                if (remove_last_op) { self.operations.pop(); }
                return self._applyChangeHandling(result, lastOpID, from_xml);
            })
            .then(function () {
                self._updateButtons();
                if (self.sidebar.state.mode !== 'properties') {
                    // TODO: the sidebar will be updated by clicking on the node
                    self._updateSidebar(self.sidebar.state.mode);
                }
                bus.trigger('toggle_snack_bar', 'saved');
            });
    },
    /**
     * To be overriden.
     *
     * @param {Object} result
     * @param {String} [opID]
     * @param {boolean} [from_xml]
     * @returns {Promise}
     */
    _applyChangeHandling: function (result, opID, from_xml) {
        return Promise.resolve();
    },
    /**
     * To be overriden.
     *
     * @private
     * @param {Object} lastOp
     */
    _cleanOperationsStack: function (lastOp) {
        this.operations = [];
        this.operations_undone = [];
    },
    /**
     * @private
     * @param {Object} op
     * @returns {Promise}
     */
    _do: function (op) {
        op.id = _.uniqueId('op_');
        this.operations.push(op);
        this.operations_undone = [];

        return this._applyChanges(false, op.type === 'replace_arch');
    },
    /**
     * To be overriden.
     *
     * @private
     * @param {String} [mode]
     * @param {Object} [params]
     * @returns {Promise<Object>}
     */
    _getSidebarState: function (mode, params) {
        var newState = mode ? {mode: mode} : this.sidebar.state;
        return Promise.resolve(newState);
    },
    /**
     * To be overriden.
     *
     * The point of this function is to receive a list of customize operations
     * to do.
     *
     * @private
     * @param {Integer} view_id
     * @param {String} studio_view_arch
     * @param {Array} operations
     * @returns {Promise}
     */
    _editView: function (view_id, studio_view_arch, operations) {
        return Promise.resolve();
    },
    /**
     * To be overriden.
     *
     * This is used when the view is edited with the XML editor: the whole arch
     * is replaced by a new one.
     *
     * @private
     * @param {Integer} view_id
     * @param {String} view_arch
     * @returns {Promise}
     */
    _editViewArch: function (view_id, view_arch) {
        return Promise.resolve();
    },
    /**
     * To be overriden.
     *
     * @param {Object} params
     * @returns {Promise}
     */
    _instantiateEditor: function (params) {
        return Promise.resolve();
    },
    /**
     * To be overriden.
     * TODO: should probably have the same signature than instantiateEditor
     *
     * @param {Object} state
     * @returns {Widget} a sidebar instance
     */
    _instantiateSidebar: function (state) {
    },
    /**
     * Redo the last operation.
     *
     * @private
     * @returns {Promise}
     */
    _redo: function () {
        if (!this.operations_undone.length) {
            return;
        }
        var op = this.operations_undone.pop();
        this.operations.push(op);

        return this._applyChanges(false, op.type === 'replace_arch');
    },
    /**
     * Update the undo/redo button according to the operation stack.
     */
    _updateButtons: function () {
        // Undo button
        if (this.operations.length) {
            bus.trigger('undo_available');
        } else {
            bus.trigger('undo_not_available');
        }

        // Redo button
        if (this.operations_undone.length) {
            bus.trigger('redo_available');
        } else {
            bus.trigger('redo_not_available');
        }
    },
    /**
     * Re-render the sidebar and destroy the old while keeping the scroll
     * position.
     * If mode is not specified, the sidebar will be renderered with the same
     * state.
     * The sidebar will be detached if the XML editor is displayed.
     *
     * @private
     * @param {String} [mode]
     * @param {Object} [params]
     * @returns {Promise}
     */
    _updateSidebar: function (mode, params) {
        var self = this;

        if  (this.sidebar.$el) {
            // as the sidebar is updated via trigger_up (`sidebar_tab_changed`),
            // we might want to update a sidebar which wasn't started yet

            // TODO: scroll top is calculated to 'o_web_studio_sidebar_content'
            this.sidebarScrollTop = this.sidebar.$el.scrollTop();
        }

        return this._getSidebarState(mode, params).then(function (newState) {
            var oldSidebar = self.sidebar;
            var previousState = oldSidebar.getLocalState ? oldSidebar.getLocalState() : undefined;
            self.sidebar = self._instantiateSidebar(newState, previousState);

            var fragment = document.createDocumentFragment();
            return self.sidebar.appendTo(fragment).then(function () {
                oldSidebar.destroy();
                if (!self.sidebar.isDestroyed()) {
                    self.sidebar.$el.prependTo(self.$el);
                    if (self.sidebar.on_attach_callback) {
                        self.sidebar.on_attach_callback();
                    }
                    self.sidebar.$el.scrollTop(self.sidebarScrollTop);
                    // the XML editor replaces the sidebar in this case
                    if (self.mode === 'rendering') {
                        self.sidebar.$el.detach();
                    }
                }
            });
        });
    },
    /**
     * Undo the last operation.
     *
     * @private
     * @param {String} [opID] unique operation identifier
     * @param {Boolean} [forget=False]
     * @returns {Promise}
     */
    _undo: function (opID, forget) {
        if (!this.operations.length) {
            return Promise.resolve();
        }

        // find the operation to undo and update the operations stack
        var op;
        if (opID) {
            op = _.findWhere(this.operations, {id: opID});
            this.operations = _.without(this.operations, op);
        } else {
            op = this.operations.pop();
        }

        if (!forget) {
            // store the operation in case of redo
            this.operations_undone.push(op);
        }

        if (op.type === 'replace_arch') {
            // as the whole arch has been replace (A -> B),
            // when undoing it, the operation (B -> A) is added and
            // removed just after.
            var undo_op = jQuery.extend(true, {}, op);
            undo_op.old_arch = op.new_arch;
            undo_op.new_arch = op.old_arch;
            this.operations.push(undo_op);
            return this._applyChanges(true, true);
        } else {
            return this._applyChanges(false, false);
        }
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onCloseXMLEditor: function () {
        this.XMLEditor.destroy();
        this.XMLEditor = null;
        this.sidebar.prependTo(this.$el);
        $('body').removeClass('o_in_studio_xml_editor');
        this.mode = 'edition';
    },
    /**
     * To be overriden.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onDragComponent: function (ev) {
    },
    /**
     * To be overriden.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onNodeClicked: function (ev) {
    },
    /**
     * @private
     */
    _onOpenXMLEditor: function () {
        var self = this;
        this.mode = 'rendering';

        this.XMLEditor = new XMLEditor(this, this.view_id, {
            position: 'left',
            doNotLoadSCSS: true,
            doNotLoadJS: true,
        });

        this.XMLEditor.prependTo(this.$el).then(function () {
            self.sidebar.$el.detach();
            $('body').addClass('o_in_studio_xml_editor');
        });
    },
    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onSaveXMLEditor: function (ev) {
        this._do({
            type: 'replace_arch',
            view_id: ev.data.view_id,
            old_arch: ev.data.old_arch,
            new_arch: ev.data.new_arch,
        }).then(function () {
            if (ev.data.on_success) {
                ev.data.on_success();
            }
        });
    },
    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onSidebarTabChanged: function (ev) {
        this._updateSidebar(ev.data.mode);
        this.editor.unselectedElements();
    },
    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onStudioError: function (ev) {
        this.do_warn(_t("Error"), this.error_messages[ev.data.error]);
    },
    /**
     * To be overriden.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onViewChange: function (ev) {
    },
});

return AbstractEditorManager;

});
