odoo.define('web_editor.wysiwyg.root', function (require) {
'use strict';

return;
var Widget = require('web.Widget');

var assetsLoaded = false;

var WysiwygRoot = Widget.extend({
    assetLibs: ['web_editor.compiled_assets_wysiwyg'],
    _loadLibsTplRoute: '/web_editor/public_render_template',

    publicMethods: ['isDirty', 'save', 'getValue', 'setValue', 'getEditable', 'on', 'trigger', 'focus', 'saveModifiedImages'],

    /**
     *   @see 'web_editor.wysiwyg' module
     **/
    init: function (parent, params) {
        this._super.apply(this, arguments);
        this._params = params;
        this.$editor = null;
    },
    /**
     * Load assets
     *
     * @override
     **/
    willStart: function () {
        var self = this;

        var $target = this.$el;
        this.$el = null;

        return this._super().then(function () {
            // FIXME: this code works by pure luck. If the web_editor.wysiwyg
            // JS module was requiring a delayed module, using it here right
            // away would lead to a crash.
            if (!assetsLoaded) {
                var Wysiwyg = odoo.__DEBUG__.services['web_editor.wysiwyg'];
                _.each(['getRange', 'setRange', 'setRangeFromNode'], function (methodName) {
                    WysiwygRoot[methodName] = Wysiwyg[methodName].bind(Wysiwyg);
                });
                assetsLoaded = true;
            }

            var Wysiwyg = self._getWysiwygContructor();
            var instance = new Wysiwyg(self, self._params);
            if (self.__extraAssetsForIframe) {
                instance.__extraAssetsForIframe = self.__extraAssetsForIframe;
            }
            self._params = null;

            _.each(self.publicMethods, function (methodName) {
                self[methodName] = instance[methodName].bind(instance);
            });

            return instance.attachTo($target).then(function () {
                self.$editor = instance.$editor || instance.$el;
            });
        });
    },

    _getWysiwygContructor: function () {
        return odoo.__DEBUG__.services['web_editor.wysiwyg'];
    }
});

return WysiwygRoot;

});
