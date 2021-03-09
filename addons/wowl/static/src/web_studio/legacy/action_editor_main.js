/** @odoo-module **/

/**
 * Formerly action_editor_action, slightly adapted
 */

import core from 'web.core';
import Dialog from 'web.Dialog';
import dom from 'web.dom';
import session from 'web.session';
import Widget from 'web.Widget';

import ActionEditor from 'web_studio.ActionEditor';
import bus from 'web_studio.bus';
import NewViewDialog from 'web_studio.NewViewDialog';
import MapViewDialog from 'web_studio.MapViewDialog';
import { ViewEditorManager } from './views/view_editor_manager';

const _t = core._t;
const _lt = core._lt;

export const ActionEditorMain = Widget.extend({
    custom_events: {
        'studio_default_view': '_onSetDefaultView',
        'studio_restore_default_view': '_onRestoreDefaultView',
        'studio_disable_view': '_onDisableView',
        'studio_edit_view': '_onEditView',
        'studio_new_view': '_onNewView',
        'studio_edit_action': '_onEditAction',
    },
    /**
     * @constructor
     * @param {Object} options
     * @param {Object} options.action - action description
     * @param {Boolean} options.chatter_allowed
     * @param {string} [options.controllerState]
     * @param {boolean} [options.noEdit] - do not edit a view
     * @param {string} [options.viewType]
     * @param {Object} [options.x2mEditorPath]
     */
    init: function (parent, options) {
        this._super.apply(this, arguments);

        this._title = _t('Studio');
        if (this.controlPanelProps) {
            this.controlPanelProps.title = this._title;
        }
        this.options = options;
        this.action = options.action;

        this._setEditedView(options.viewType);

        // We set the x2mEditorPath since when we click on the studio breadcrumb
        // a new view_editor_manager is instantiated and then the previous
        // x2mEditorPath is needed to reload the previous view_editor_manager
        // state.
        this.x2mEditorPath = options.x2mEditorPath;
        this.activityAllowed = undefined;
        this.controllerState = options.controllerState || {};
    },
    /**
     * @override
     */
    willStart: function () {
        if (!this.action) {
            return Promise.reject();
        }
        var defs = [this._super.apply(this, arguments), this._isActivityAllowed()];
        return Promise.all(defs);
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        var def;
        this.$el.addClass('o_web_studio_client_action');
        var isEditable = _.contains(ActionEditor.prototype.VIEW_TYPES, this.viewType);
        if (this.options.noEdit || !isEditable) {
            // click on "Views" in menu or view we cannot edit
            this.action_editor = new ActionEditor(this, this.action);
            def = this.action_editor.appendTo(this.$('.o_content'));
        } else {
            // directly edit the view instead of displaying all views
            def = this._editView();
        }
        return Promise.all([def, this._super.apply(this, arguments)]).then(function () {
            self._pushState();
            bus.trigger('studio_main', self.action);
            if (!self.options.noEdit) {
                // TODO: try to put it in editView
                bus.trigger('edition_mode_entered', self.viewType);
            }
        });
    },
    /**
     * @override
     */
    on_attach_callback: function () {
        this.isInDOM = true;
        if (this.view_editor) {
            this.view_editor.on_attach_callback();
        }
    },
    /**
     * @override
     */
    on_detach_callback: function () {
        this.isInDOM = false;
        if (this.view_editor) {
            this.view_editor.on_detach_callback();
        }
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Object} action
     * @param {String} view_type
     * @param {Object} args
     * @returns {Promise}
     */
    _addViewType: function (action, view_type, args) {
        var self = this;
        return new Promise(function (resolve, reject) {
            core.bus.trigger('clear_cache');
            self._rpc({
                route: '/web_studio/add_view_type',
                params: {
                    action_type: action.type,
                    action_id: action.id,
                    res_model: action.res_model,
                    view_type: view_type,
                    args: args,
                    context: session.user_context,
                },
            }).then(function (result) {
                if (result !== true) {
                    var params = {
                        action: action,
                        callback: function () {
                            self._editAction(action, args).then(function (result) {
                                resolve(result);
                            });
                        },
                    };
                    if (_.contains(['gantt', 'calendar', 'cohort'], view_type)) {
                        params.view_type = view_type;
                        if (_.contains(['gantt', 'cohort'], view_type)) {
                            params.mandatory_stop_date = true;
                        }
                        new NewViewDialog(self, params).open();
                    } else if (view_type === 'map') {
                        new MapViewDialog(self, params).open();
                    } else {
                        var message = result;
                        if (!message) {
                            message = _lt("Creating this type of view is not currently supported in Studio.");
                        }
                        Dialog.alert(self, message);
                        reject();
                    }
                } else {
                    return self._reloadAction(action.id)
                        .then(resolve)
                        .guardedCatch(reject);
                }
            });
        });
    },
    /**
     * @private
     * @param {Object} action
     * @param {Object} args
     * @returns {Promise}
     */
    _editAction: function (action, args) {
        var self = this;
        core.bus.trigger('clear_cache');
        return this._rpc({
            route: '/web_studio/edit_action',
            params: {
                action_type: action.type,
                action_id: action.id,
                args: args,
                context: session.user_context,
            },
        }).then(function (result) {
            if (result !== true) {
                Dialog.alert(self, result);
            } else {
                return self._reloadAction(action.id);
            }
        });
    },
    /**
     * @private
     */
    _editView: function () {
        var self = this;

        // the default view needs to be created before `loadViews` or the
        // renderer will not be aware that a new view exists
        var defs = [this._getStudioViewArch(this.action.res_model, this.viewType, this.viewId)];
        if (this.viewType === 'form') {
            defs.push(this._isChatterAllowed());
        }
        return Promise.all(defs).then(function () {
            // add studio in loadViews context to retrieve groups server-side
            // We load views in the base language to make sure we read/write on the source term field
            // of ir.ui.view
            var context = _.extend({}, self.action.context, {studio: true, lang: false});
            var loadViewDef = self.loadViews(self.action.res_model, context, self.views, { load_filters: true });
            return loadViewDef.then(function (fields_views) {
                if (!self.action.controlPanelFieldsView) {
                    // in case of Studio navigation, the processing done on the
                    // action in ActWindowActionManager@_executeWindowAction
                    // is by-passed
                    self.action.controlPanelFieldsView = fields_views.search;
                }
                if (!self.controllerState.currentId) {
                    self.controllerState.currentId = self.controllerState.resIds && self.controllerState.resIds[0];
                }
                var params = {
                    action: self.action,
                    fields_view: fields_views[self.viewType],
                    viewType: self.viewType,
                    chatter_allowed: self.chatter_allowed,
                    studio_view_id: self.studioView.studio_view_id,
                    studio_view_arch: self.studioView.studio_view_arch,
                    x2mEditorPath: self.x2mEditorPath,
                    controllerState: self.controllerState,
                };
                self.view_editor = new ViewEditorManager(self, params);

                var fragment = document.createDocumentFragment();
                return self.view_editor.appendTo(fragment).then(function () {
                    if (self.action_editor) {
                        dom.detach([{widget: self.action_editor}]);
                    }
                    dom.append(self.$el, [fragment], {
                        in_DOM: self.isInDOM,
                        callbacks: [{widget: self.view_editor}],
                    });
                });
            });
        });
    },
    /**
     * @private
     * @param {String} model
     * @param {String} view_type
     * @param {Integer} view_id
     * @returns {Promise}
     */
    _getStudioViewArch: function (model, view_type, view_id) {
        var self = this;
        core.bus.trigger('clear_cache');
        self.studioView = {
            studio_view_id: false,
            studio_view_arch: "<data/>",
        };
        // return this._rpc({
        //     route: '/web_studio/get_studio_view_arch',
        //     params: {
        //         model: model,
        //         view_type: view_type,
        //         view_id: view_id,
        //         // We load views in the base language to make sure we read/write on the source term field
        //         // of ir.ui.view
        //         context: _.extend({}, session.user_context, {lang: false}),
        //     },
        // }).then(function (studioView) {
        //     self.studioView = studioView;
        // });
    },
    /**
     * Determines whether the model that will be edited supports mail_activity.
     *
     * @private
     * @returns {Promise}
     */
    _isActivityAllowed: function () {
        var self = this;
        // var modelName = this.action.res_model;
        return Promise.resolve().then(() => {
            self.activityAllowed = true;
        // return this._rpc({
        //     route: '/web_studio/activity_allowed',
        //     params: {
        //         model: modelName,
        //     }
        // }).then(function (activityAllowed) {
            // self.activityAllowed = activityAllowed;
        });
    },
    /**
     * @private
     * Determines whether the model
     * that will be edited supports mail_thread
     * @returns {Promise}
     */
    _isChatterAllowed: function () {
        var self = this;
        // var res_model = this.action.res_model;
        return Promise.resolve().then(() => {
            self.chatter_allowed = false;
        // return this._rpc({
        //     route: '/web_studio/chatter_allowed',
        //     params: {
        //         model: res_model,
        //     }
        // }).then(function (isChatterAllowed) {
        //     self.chatter_allowed = isChatterAllowed;
        });
    },

    /**
     * @private
     */
    _pushState: function () {
        // as there is no controller, we need to update the state manually
        var state = {
            action: this.action.id,
            model: this.action.res_model,
            view_type: this.viewType,
        };
        // TODO: necessary?
        if (this.action.context) {
            var active_id = this.action.context.active_id;
            if (active_id) {
                state.active_id = active_id;
            }
            var active_ids = this.action.context.active_ids;
            // we don't push active_ids if it's a single element array containing the active_id
            // to make the url shorter in most cases
            if (active_ids && !(active_ids.length === 1 && active_ids[0] === active_id)) {
                state.active_ids = this.action.context.active_ids.join(',');
            }
        }
        this.trigger_up('push_state', {
            state: state,
            studioPushState: true,  // see action_manager @_onPushState
        });
    },
    /**
     * @private
     * @param {Integer} actionID
     * @returns {Promise}
     */
    _reloadAction: function (actionID) {
        var self = this;
        return new Promise(function (resolve) {
            self.trigger_up('reload_action', {
                actionID: actionID,
                onSuccess: resolve,
            });
        });
    },
    /**
     * @private
     * @param {string} [viewType]
     */
    _setEditedView: function (viewType) {
        var views = this.action._views || this.action.views;
        this.views = views.slice();
        // search is not in action.view
        var searchview_id = this.action.search_view_id && this.action.search_view_id[0];
        this.views.push([searchview_id || false, 'search']);
        var view = _.find(this.views, function (v) {
            return v[1] === viewType;
        });
        this.view = view || this.views[0];  // see action manager
        this.viewId = this.view[0];
        this.viewType = this.view[1];
    },
    /**
     * @private
     * @param {String} view_mode
     * @returns {Promise}
     */
    _writeViewMode: function (view_mode, initial_view_mode) {
        var self = this;
        var def = this._editAction(this.action, {view_mode: view_mode});
        return def.then(function (result) {
            if (initial_view_mode) {
                result.initial_view_types = initial_view_mode.split(',');
            }
            return self.do_action('action_web_studio_action_editor', {
                action: result,
                noEdit: true,
            });
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {OdooEvent} event
     */
    _onDisableView: function (event) {
        var view_type = event.data.view_type;
        var view_mode = _.without(this.action.view_mode.split(','), view_type);

        if (!view_mode.length) {
            Dialog.alert(this, _t("You cannot deactivate this view as it is the last one active."));
        } else {
            this._writeViewMode(view_mode.toString());
        }
    },
    /**
     * @private
     * @param {OdooEvent} event
     */
    _onEditAction: function (event) {
        var self = this;

        var args = event.data.args;
        if (!args) { return; }

        this._editAction(this.action, args).then(function (result) {
            self.action = result;
        });
    },
    /**
     * @private
     * @param {OdooEvent} event
     * @param {string} event.data.view_type
     */
    _onEditView: function (event) {
        this._setEditedView(event.data.view_type);
        this._editView().then(function () {
            bus.trigger('edition_mode_entered', event.data.view_type);
        });
    },
    /**
     * @private
     * @param {OdooEvent} event
     */
    _onNewView: function (event) {
        var self = this;
        var view_type = event.data.view_type;

        if (view_type === 'activity' && !this.activityAllowed) {
            this.do_warn(false, _t("Activity view unavailable on this model"));
            return;
        }

        var view_mode = this.action.view_mode + ',' + view_type;
        var def = this._addViewType(this.action, view_type, {
            view_mode: view_mode,
        });
        def.then(function (result) {
            self.do_action('action_web_studio_action_editor', {
                action: result,
                viewType: view_type,
            });
        });
    },
    /**
     * @private
     */
    _onRestoreDefaultView: function (event) {
        var self = this;

        var message = _t('Are you sure you want to restore the default view?\r\nAll customization done with studio on this view will be lost.');

        Dialog.confirm(this, message, {
            confirm_callback: function () {
                var context = _.extend({}, self.action.context, {studio: true, lang: false});
                //To restore the default view from an inherited one, we need first to retrieve the default view id
                var loadViewDef = self.loadViews(self.action.res_model, context, self.views, { load_filters: true });
                loadViewDef.then(function (fields_views) {
                    self._rpc({
                        route: '/web_studio/restore_default_view',
                        params: {
                            view_id: fields_views[event.data.view_type].view_id,
                        },
                    });
                });
            },
            dialogClass: 'o_web_studio_preserve_space'
        });
    },
    /**
     * @private
     * @param {OdooEvent} event
     */
    _onSetDefaultView: function (event) {
        var selected_view_type = event.data.view_type;
        var view_types = _.map(this.action.views, ({ type }) => type);
        var view_mode = _.without(view_types, selected_view_type);
        view_mode.unshift(selected_view_type);
        view_mode = view_mode.toString();

        this._writeViewMode(view_mode, this.action.view_mode);
    },
});
