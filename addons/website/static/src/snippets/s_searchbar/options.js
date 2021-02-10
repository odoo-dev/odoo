odoo.define('website.s_searchbar_options', function (require) {
'use strict';

const options = require('web_editor.snippets.options');

const searchBarOptions = options.Class.extend({
    //--------------------------------------------------------------------------
    // Options
    //--------------------------------------------------------------------------

    setSearchType: function (previewMode, widgetValue, params) {
        const form = this.$target.parents('form');
        form.attr('action', params.formAction);

        if (!previewMode) {
            this.trigger_up('snippet_edition_request', {exec: () => {
                const widget = this._requestUserValueWidgets('order_opt')[0];
                const orderBy = widget.getValue("selectDataAttribute");
                const orderSelect = this.$el.find("we-select[data-name='order_opt']");
                const order = orderSelect.find("we-button[data-select-data-attribute='" + orderBy + "']")[0];
                if (order.classList.contains("d-none")) {
                    const defaultOrder = orderSelect.find("we-button[data-name='order_name_asc_opt']")[0];
                    defaultOrder.click(); // open
                    defaultOrder.click(); // close
                }
            }});
        }
    },

    setOrderBy: function (previewMode, widgetValue, params) {
        const form = this.$target.parents('form');
        form.find(".o_search_order_by").attr("value", widgetValue);
    },
});

options.registry.SearchBar = searchBarOptions;
return searchBarOptions;
});
