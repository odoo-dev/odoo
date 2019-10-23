odoo.define('website.snippet.editor', function (require) {
'use strict';

const weSnippetEditor = require('web_editor.snippet.editor');
const ThemeCustomizationMenu = require('website.theme');

weSnippetEditor.Class.include({
    events: _.extend({}, weSnippetEditor.Class.prototype.events, {
        'click .o_we_customize_theme_btn': '_onThemeTabClick',
    }),

    tabs: _.extend({}, weSnippetEditor.Class.prototype.tabs, {
        THEME: 'theme',
    }),

    start: function () {
        this.themeCustomizationMenu = new ThemeCustomizationMenu(this, {tab: false});
        const _super = this._super;
        return this.themeCustomizationMenu.appendTo($('<div>')).then(() => _super.apply(this, ...arguments));
    },
    /**
     * @override
     */
    _updateLeftPanelContent: function ({content, tab}) {
        this._super(...arguments);
        this.$('.o_we_customize_theme_btn').toggleClass('active', tab === this.tabs.THEME);
    },
    /**
     * Selects the theme customization tab
     *
     * @private
     */
    _showThemeCustomizationMenu: function () {
        this._activateSnippet(false);
        this._updateLeftPanelContent({
            content: this.themeCustomizationMenu.$el,
            tab: this.tabs.THEME,
        });
    },
    /**
     * @private
     */
    _onThemeTabClick: function (ev) {
        this._showThemeCustomizationMenu();
    },
});
});

