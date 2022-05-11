/** @odoo-module **/

import Widget from 'web.Widget';
import { ComponentWrapper, WidgetAdapterMixin } from 'web.OwlCompatibility';
import PermissionPanel from '../../components/permission_panel/permission_panel.js';

const PermissionPanelWidget = Widget.extend(WidgetAdapterMixin, {
    /**
     * @override
     * @param {Widget} parent
     * @param {Object} options
     */
    init: function (parent, options) {
        this._super.apply(this, arguments);
        this.options = options;
    },

    /**
     * @override
     */
    start: function () {
        this.component = new ComponentWrapper(this, PermissionPanel, this.options);
        this.component.env.bus.on('reload_tree', this, this._onReloadTree);
        this.component.env.bus.on('reload_view', this, this._onReloadView);
        return this.component.mount(this.el);
    },

    /**
     * @override
     */
    destroy: function () {
        this.component.env.bus.off('reload_tree', this._onReloadTree);
        this.component.env.bus.off('reload_view', this._onReloadView);
        return this._super(...arguments);
    },

    _onReloadTree: function () {
        this.trigger_up('reload_tree', {});
    },

    _onReloadView: function () {
        this.trigger_up('reload_view', {});
    },

    /**
     * Reloads the permission panel.
     */
    _reloadPanel: function () {
        this.component.env.bus.trigger('reload_panel');
    },
});

export default PermissionPanelWidget;
