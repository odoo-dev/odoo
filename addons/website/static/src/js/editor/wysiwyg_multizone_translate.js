odoo.define('web_editor.wysiwyg.multizone.translate', function (require) {
'use strict';

var core = require('web.core');
var webDialog = require('web.Dialog');
var WysiwygMultizone = require('web_editor.wysiwyg.multizone');
var Dialog = require('wysiwyg.widgets.Dialog');
var websiteNavbarData = require('website.navbar');

return;

var _t = core._t;


var RTETranslatorWidget = rte.Class.extend({
    /**
     * If the element holds a translation, saves it. Otherwise, fallback to the
     * standard saving but with the lang kept.
     *
     * @override
     */
    _saveElement: function ($el, context, withLang) {
        var self = this;
        if ($el.data('oe-translation-id')) {
            return this._rpc({
                model: 'ir.translation',
                method: 'save_html',
                args: [
                    [+$el.data('oe-translation-id')],
                    this._getEscapedElement($el).html()
                ],
                context: context,
            });
        }
        return this._super($el, context, withLang === undefined ? true : withLang);
    },
});

var WysiwygTranslate = WysiwygMultizone.extend({
    custom_events: _.extend({}, WysiwygMultizone.prototype.custom_events || {}, {
        ready_to_save: '_onSave',
        rte_change: '_onChange',
    }),

    /**
     * @override
     * @param {string} options.lang
     */
    init: function (parent, options) {
        this.lang = options.lang;
        options.recordInfo = _.defaults({
                context: {lang: this.lang}
            }, options.recordInfo, options);
        this._super.apply(this, arguments);
    },
    /**
     * @override
     */
    start: function () {
        var self = this;
        // Hacky way to keep the top editor toolbar in translate mode for now
        this.$webEditorTopEdit = $('<div id="web_editor-top-edit"></div>').prependTo(document.body);
        this.options.toolbarHandler = this.$webEditorTopEdit;
        this.editor = new (this.Editor)(this, Object.assign({Editor: RTETranslatorWidget}, this.options));
        this.$editor = this.editor.rte.editable();
        var promise = this.editor.prependTo(this.$editor[0].ownerDocument.body);

        return promise.then(function () {
            self._relocateEditorBar();
            var attrs = ['placeholder', 'title', 'alt', 'value'];
            const $editable = self._getEditableArea();
            const translationRegex = /<span [^>]*data-oe-translation-id="([0-9]+)"[^>]*>(.*)<\/span>/;
            let $edited = $();
            _.each(attrs, function (attr) {
                const attrEdit = $editable.filter('[' + attr + '*="data-oe-translation-id="]').filter(':empty, input, select, textarea, img');
                attrEdit.each(function () {
                    var $node = $(this);
                    var translation = $node.data('translation') || {};
                    var trans = $node.attr(attr);
                    var match = trans.match(translationRegex);
                    var $trans = $(trans).addClass('d-none o_editable o_editable_translatable_attribute').appendTo('body');
                    $trans.data('$node', $node).data('attribute', attr);

                    translation[attr] = $trans[0];
                    $node.attr(attr, match[2]);

                    $node.addClass('o_translatable_attribute').data('translation', translation);
                });
                $edited = $edited.add(attrEdit);
            });
            const textEdit = $editable.filter('textarea:contains(data-oe-translation-id)');
            textEdit.each(function () {
                var $node = $(this);
                var translation = $node.data('translation') || {};
                var trans = $node.text();
                var match = trans.match(translationRegex);
                var $trans = $(trans).addClass('d-none o_editable o_editable_translatable_text').appendTo('body');
                $trans.data('$node', $node);

                translation['textContent'] = $trans[0];
                $node.text(match[2]);

                $node.addClass('o_translatable_text').data('translation', translation);
            });
            $edited = $edited.add(textEdit);

            $edited.each(function () {
                var $node = $(this);
                var select2 = $node.data('select2');
                if (select2) {
                    select2.blur();
                    $node.on('translate', function () {
                        select2.blur();
                    });
                    $node = select2.container.find('input');
                }
            });

            self.translations = [];
            self.$translations = self._getEditableArea().filter('.o_translatable_attribute, .o_translatable_text');
            self.$editables = $('.o_editable_translatable_attribute, .o_editable_translatable_text');

            self.$editables.on('change', function () {
                self.trigger_up('rte_change', {target: this});
            });

            self._markTranslatableNodes();
        });
    },
    /**
     * @override
     */
    destroy: function () {
        this._super(...arguments);
        this.$webEditorTopEdit.remove();
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     * @returns {Boolean}
     */
    isDirty: function () {
        return this._super() || this.$editables.hasClass('o_dirty');
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Return the editable area.
     *
     * @override
     * @returns {JQuery}
     */
    _getEditableArea: function () {
        var $editables = this._super();
        return $editables.add(this.$editables);
    },
    /**
     * Return an object describing the linked record.
     *
     * @override
     * @param {Object} options
     * @returns {Object} {res_id, res_model, xpath}
     */
    _getRecordInfo: function (options) {
        options = options || {};
        var recordInfo = this._super(options);
        var $editable = $(options.target).closest(this._getEditableArea());
        if (!$editable.length) {
            $editable = $(this._getFocusedEditable());
        }
        recordInfo.context.lang = this.lang;
        recordInfo.translation_id = $editable.data('oe-translation-id')|0;
        return recordInfo;
    },
    /**
     * @override
     * @returns {Object} the summernote configuration
     */
    _editorOptions: function () {
        var options = this._super();
        options.toolbar = [
            // todo: hide this feature for field (data-oe-model)
            ['font', ['bold', 'italic', 'underline', 'clear']],
            ['fontsize', ['fontsize']],
            ['color', ['color']],
            // keep every time
            ['history', ['undo', 'redo']],
        ];
        return options;
    },
    /**
     * Called when text is edited -> make sure text is not messed up and mark
     * the element as dirty.
     *
     * @override
     * @param {Jquery Event} [ev]
     */
    _onChange: function (ev) {
        var $node = $(ev.data.target);
        if (!$node.length) {
            return;
        }
        $node.find('div,p').each(function () { // remove P,DIV elements which might have been inserted because of copy-paste
            var $p = $(this);
            $p.after($p.html()).remove();
        });
        var trans = this._getTranlationObject($node[0]);
        $node.toggleClass('o_dirty', trans.value !== $node.html().replace(/[ \t\n\r]+/, ' '));
    },
    /**
     * Returns a translation object.
     *
     * @private
     * @param {Node} node
     * @returns {Object}
     */
    _getTranlationObject: function (node) {
        var $node = $(node);
        var id = +$node.data('oe-translation-id');
        if (!id) {
            id = $node.data('oe-model')+','+$node.data('oe-id')+','+$node.data('oe-field');
        }
        var trans = _.find(this.translations, function (trans) {
            return trans.id === id;
        });
        if (!trans) {
            this.translations.push(trans = {'id': id});
        }
        return trans;
    },
    /**
     * @private
     */
    _markTranslatableNodes: function () {
        var self = this;
        this._getEditableArea().each(function () {
            var $node = $(this);
            var trans = self._getTranlationObject(this);
            trans.value = (trans.value ? trans.value : $node.html() ).replace(/[ \t\n\r]+/, ' ');
        });
        this._getEditableArea().prependEvent('click.translator', function (ev) {
            if (ev.ctrlKey || !$(ev.target).is(':o_editable')) {
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();
        });

        // attributes and textarea text

        this.$translations.each(function () {
            var $node = $(this);
            var translation = $node.data('translation');
            _.each(translation, function (node, attr) {
                var trans = self._getTranlationObject(node);
                trans.value = (trans.value ? trans.value : $node.html() ).replace(/[ \t\n\r]+/, ' ');
                $node.attr('data-oe-translation-state', (trans.state || 'to_translate'));
            });
        });

        this.$translations.prependEvent('mousedown.translator click.translator mouseup.translator', function (ev) {
            if (ev.ctrlKey) {
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();
            if (ev.type !== 'mousedown') {
                return;
            }

            new AttributeTranslateDialog(self, {}, ev.target).open();
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    _onSave: function (ev) {
        ev.stopPropagation();
    },
});

return WysiwygTranslate;
});
