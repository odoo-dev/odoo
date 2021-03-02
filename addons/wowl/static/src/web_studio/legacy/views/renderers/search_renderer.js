odoo.define('web_studio.SearchRenderer', function (require) {
"use strict";

var config = require('web.config');
var core = require('web.core');
var utils = require('web.utils');
var Widget = require('web.Widget');

var qweb = core.qweb;


var SearchRenderer = Widget.extend({
    className: "o_search_view",

    /**
     * @constructor
     * @param {Object} fields_view
     * @param {Object} fields_view.arch
     * @param {Object} fields_view.fields
     * @param {String} fields_view.model
     */
    init: function (parent, fields_view) {
        this._super.apply(this, arguments);
        // see SearchView init
        fields_view = this._processFieldsView(_.clone(fields_view));
        this.arch = fields_view.arch;
        this.fields = fields_view.fields;
        this.model = fields_view.model;
    },
    /**
     * @override
     */
    start: function () {
        this.$el.addClass(this.arch.attrs.class);
        return this._super.apply(this, arguments).then(this._render.bind(this));
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * This is the reverse operation from getLocalState.  With this method, we
     * expect the renderer to restore all DOM state, if it is relevant.
     *
     * This method is called after each updateState, by the controller.
     * Needed here because the search widget is not a view anymore
     * in the web client but used as one in studio
     *
     * @see getLocalState
     * @param {any} localState the result of a call to getLocalState
     */
    setLocalState: function () {
    },
    /**
     * Returns any relevant state that the renderer might want to keep.
     *
     * The idea is that a renderer can be destroyed, then be replaced by another
     * one instantiated with the state from the model and the localState from
     * the renderer, and the end result should be the same.
     *
     * The kind of state that we expect the renderer to have is mostly DOM state
     * such as the scroll position, the currently active tab page, ...
     *
     * This method is called before each updateState, by the controller.
     *
     * @see setLocalState
     * @returns {any}
     */
    getLocalState: function () {
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Return nodes which can be displayed in search view for Studio.
     * This method is overridden in search_editor to admit invisible fields.
     *
     * @private
     * @returns {Array} the list of elements to display
     */
    _getNodesToTreat() {
        return this.arch.children.slice().filter(node => node.attrs.invisible !== "1");
    },
    /**
     * Processes a fieldsView in place. In particular, parses its arch.
     *
     * @todo: this function is also defined in SearchView and AbstractView ; the
     * code duplication could be removed once the SearchView will be rewritten.
     * @private
     * @param {Object} fv
     * @param {string} fv.arch
     * @returns {Object} the processed fieldsView
     */
    _processFieldsView: function (fv) {
        var doc = $.parseXML(fv.arch).documentElement;
        fv.arch = utils.xml_to_json(doc, true);
        return fv;
    },
    /**
     * Parse the arch to render each node.
     *
     * @private
     */
    _render: function () {
        var self = this;
        this.defs = [];
        this.$el.empty();
        this.$el.html(qweb.render('web_studio.searchRenderer', this.widget));
        this.first_field = undefined;
        this.first_filter = undefined;
        this.first_group_by = undefined;
        let nodesToTreat = this._getNodesToTreat();
        while (nodesToTreat.length) {
            var node = nodesToTreat.shift();
            if (node.tag === "field"){
                if (!self.first_field){
                    self.first_field = node;
                }
                self._renderField(node);
            } else if (node.tag === "filter") {
                if (/(['"])group_by\1\s*:/.test(node.attrs.context || '')) {
                    if (!self.first_group_by) {
                        self.first_group_by = node;
                    }
                    self._renderGroupBy(node);
                } else {
                    if (!self.first_filter) {
                        self.first_filter = node;
                    }
                    self._renderFilter(node);
                }
            } else if (node.tag === "separator") {
                if (!self.first_filter){
                    self.first_filter = node;
                }
                self._renderSeparator(node);
            } else if (node.tag === "group") {
                nodesToTreat = nodesToTreat.concat(node.children);
            }
        }
        return Promise.all(this.defs);
    },
    /**
     * @private
     * @param {Object} node
     *
     * @returns {jQueryElement}
     */
    _renderField: function (node) {
        var $tbody = this.$('.o_web_studio_search_autocompletion_fields tbody');
        var field_string = this.fields[node.attrs.name].string;
        var display_string = node.attrs.string || field_string;
        if (config.isDebug()) {
            display_string += ' (' + node.attrs.name +')';
        }
        var $new_row = $('<tr>').append(
            $('<td>').append(
            $('<span>').text(display_string)
        ));
        $tbody.append($new_row);
        return $new_row;
    },
    /**
     * @private
     * @param {Object} node
     *
     * @returns {jQueryElement}
     */
    _renderFilter: function (node) {
        var $tbody = this.$('.o_web_studio_search_filters tbody');
        var display_string = node.attrs.string || node.attrs.help;
        var $new_row = $('<tr>').append(
            $('<td>').append(
            $('<span>').text(display_string)
        ));
        $tbody.append($new_row);
        return $new_row;
    },
    /**
     * @private
     * @param {Object} node
     *
     * @returns {jQueryElement}
     */
    _renderGroupBy: function (node) {
        var $tbody = this.$('.o_web_studio_search_group_by tbody');
        // the domain is define like this:
        // context="{'group_by': 'field'}"
        // we use a regex to get the field string
        var display_string = node.attrs.string;
        var field_name = node.attrs.context.match(":.?'(.*)'")[1];
        if (config.isDebug()) {
            display_string += ' (' + field_name +')';
        }
        var $new_row = $('<tr>').append(
            $('<td>').append(
            $('<span>').text(display_string)
        ));
        $tbody.append($new_row);
        return $new_row;
    },
    /**
     * @private
     * @param {Object} node
     *
     * @returns {jQueryElement}
     */
    _renderSeparator: function () {
        var $tbody = this.$('.o_web_studio_search_filters tbody');
        var $new_row = $('<tr class="o_web_studio_separator">').html('<td><hr/></td>');

        $tbody.append($new_row);
        return $new_row;
    },
});

return SearchRenderer;

});
