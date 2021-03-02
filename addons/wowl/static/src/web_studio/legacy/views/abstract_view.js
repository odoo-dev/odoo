odoo.define('web_studio.AbstractViewEditor', function (require) {
"use strict";

var ajax = require('web.ajax');
var AbstractView = require('web.AbstractView');
const utils = require('web.utils');

AbstractView.include({

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @param {Widget} parent
     * @param {Widget} Editor
     * @param {Object} options
     * @returns {Widget}
     */
    createStudioEditor: function (parent, Editor, options) {
        return this._createStudioRenderer(parent, Editor, options);
    },
    /**
     * @param {Widget} parent
     * @param {Widget} Editor
     * @param {Object} options
     * @returns {Widget}
     */
    createStudioRenderer: function (parent, options) {
        var Renderer = this.config.Renderer;
        return this._createStudioRenderer(parent, Renderer, options);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @param {Widget} parent
     * @param {Widget} Renderer
     * @param {Object} options
     * @param {String} [options.viewType]
     * @param {String} [options.controllerState]
     * @returns {Widget}
     */
    _createStudioRenderer: function (parent, Renderer, options) {
        var self = this;
        var model = this.getModel(parent);

        var loadViewDef = this._loadSubviews ? this._loadSubviews(parent) : Promise.resolve();
        return loadViewDef.then(function () {
            const searchQuery = self.controllerParams.searchModel.get('query');
            if (options.viewType === 'list') {
                // reset the group by so lists are not grouped in studio.
                searchQuery.groupBy = [];
            }
            if (options.viewType === 'graph') {
                delete options.mode;
            }
            self._updateMVCParams(searchQuery);
            // This override is a hack because when we load the data for a subview in
            // studio we don't want to display all the record of the list view but only
            // the one set in the parent record.
            if (options.x2mField) {
                self.loadParams.static = true;
            }

            return Promise.all([
                self._loadData(model, { withSampleData: false }),
                ajax.loadLibs(self)
            ]).then(function (results) {
                var { state } = results[0];
                if (options.x2mField) {
                    self.loadParams.static = false;
                }
                var params = _.extend({}, self.rendererParams, options, {
                    // TODO: why is it defined now? because it is, the no
                    // content is displayed if no record
                    noContentHelp: undefined,
                });
                let editor;
                if (utils.isComponent(Renderer)) {
                    state = Object.assign({}, state, params);
                    const Component = state.Component;
                    delete state.Component;
                    return new Renderer(parent, Component, state);
                } else {
                    editor = new Renderer(parent, state, params);
                }
                // the editor needs to have a reference to its BasicModel
                // instance to reuse it in x2m edition
                editor.model = model;
                model.setParent(editor);
                return editor;
            });
        });
    },
});

});
