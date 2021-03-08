odoo.define('web_studio.report_fields', function (require) {
"use strict";

var fieldRegistry = require('web.field_registry');
var relationalFields = require('web.relational_fields');

/**
 * This widget is used only for rendering by the report editor (the widget options)
 *
 */


var FieldMany2ManySelection = relationalFields.FieldMany2ManyTags.extend({
    init: function (parent, name, record, options) {
        this._super.apply(this, arguments);

        options.quick_create = false;
        options.can_create = false;

        this.selection = _.map(options.attrs.selection, function (s) {
            return {id: s.field_name, res_id: s.field_name, data: {id: s.field_name, display_name: s.label}};
        });
    },
    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     * @private
     * @param {Moment|false} value
     * @returns {boolean}
     */
    _isSameValue: function (value) {
        if (value === false) {
            return this.value === false;
        }
        return value.length === this.value.res_ids.length &&
            _.difference(value, this.value.res_ids).length === 0;
    },
    /**
     * Defines an _search method for the internal m2o.
     *
     * @private
     * @param {string} search_val
     * @returns {Object[]}
     */
    _many2oneSearch: function (search_val) {
        var self = this;
        var records = _.filter(_.pluck(this.selection, 'data'), function (r) {
            return r.display_name.indexOf(search_val) !== -1 &&
               !_.findWhere(self.value.data, {id: r.id});
        });
        return _.map(records, function (r) {
            return {
                id: r.id,
                label: r.display_name,
                name: r.display_name,
                value: r.display_name,
            };
        });
    },
    /**
     *
     * @overwrite
     */
    _render: function () {
        var self = this;
        var res_ids = this.value.res_ids;
        this.value.data = _.filter(this.selection, function (s) {
            return res_ids.indexOf(s.id) !== -1;
        });
        return this._super.apply(this, arguments).then(function () {
            if (self.many2one) {
                self.many2one._autocompleteSources = [];
                self.many2one._addAutocompleteSource(self._many2oneSearch.bind(self), {});
                self.many2one.limit = Object.keys(self.selection).length;
            }
        });
    },
    /**
     *
     * @overwrite
     */
    _setValue: function (value, options) {
        var self = this;
        var selection = this.value.res_ids;

        return new Promise(function (resolve, reject) {
            switch (value.operation) {
                case "ADD_M2M":
                    selection = selection.concat([value.ids.id]);
                    break;
                case "FORGET":
                    selection = _.difference(selection, value.ids);
                    break;
                default: throw Error('Not implemented');
            }

            if (!(options && options.forceChange) && self._isSameValue(selection)) {
                return Promise.resolve();
            }

            self.value.res_ids = selection;
            self._render();

            self.trigger_up('field_changed', {
                dataPointID: self.dataPointID,
                changes: _.object([self.name], [{
                    operation: 'REPLACE_WITH',
                    ids: selection,
                }]),
                viewType: self.viewType,
                doNotSetDirty: options && options.doNotSetDirty,
                notifyChange: !options || options.notifyChange !== false,
                onSuccess: resolve,
                onFailure: reject,
            });
        });
    },
});

fieldRegistry.add('many2many_select', FieldMany2ManySelection);

return {
    FieldMany2ManySelection: FieldMany2ManySelection,
};

});

