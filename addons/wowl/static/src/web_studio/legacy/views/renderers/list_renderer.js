odoo.define('web_studio.ListRenderer', function (require) {
"use_strict";

const ListRenderer = require('web.ListRenderer');

ListRenderer.include({
    /**
    * @override
    *
    * The point of this function is to disable the optional fields dropdown icon.
    */
    _onToggleOptionalColumnDropdown: function(ev) {
        const ctx = this.state.getContext();
        if (!ctx.studio) {
            this._super.apply(this, arguments);
        }
    },
});

});
