odoo.define('wysiwyg.widgets.AltTools', function (require) {
'use strict';

var core = require('web.core');
var Widget = require('web.Widget');

var _t = core._t;

/**
 * Let users change the alt & title of a media.
 */
const AltTools = Widget.extend({
    template: 'wysiwyg.widgets.alt',
    xmlDependencies: ['/web_editor/static/src/xml/wysiwyg.xml'],

    /**
     * @constructor
     */
    init: function (parent, options, media) {
        options = options || {};
        this._super(parent, _.extend({}, {
            title: _t("Change media description and tooltip")
        }, options));

        this.media = media;
        const allEscQuots = /&quot;/g;
        this.alt = ($(this.media).attr('alt') || "").replace(allEscQuots, '"');
        const title = $(this.media).attr('title') || $(this.media).data('original-title') || "";
        this.tag_title = (title).replace(allEscQuots, '"');
    },
    /**
     * @override
     */
    start: async function () {
        const def = await this._super.apply(this, arguments);
        this.$el.find('#alt').on('input', this._onChange.bind(this));
        this.$el.find('#title').on('input', this._onChange.bind(this));
        return def;
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    _onChange: function (ev) {
        const attributeName = ev.target.id;
        const $target = $(ev.target);
        const $media = $(this.media);
        const allNonEscQuots = /"/g;
        const value = $target.val();
        $media.attr(attributeName, value ? value.replace(allNonEscQuots, "&quot;") : null);
        $media.trigger('content_changed');
        this.final_data = this.media;
    },
});


return AltTools;
});
