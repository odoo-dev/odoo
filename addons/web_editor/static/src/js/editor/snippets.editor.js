odoo.define('web_editor.snippet.editor', function (require) {
'use strict';

var concurrency = require('web.concurrency');
var core = require('web.core');
var Dialog = require('web.Dialog');
var dom = require('web.dom');
var Widget = require('web.Widget');
var snippetOptions = require('web_editor.snippets.options');
const {ColorPaletteWidget} = require('web_editor.ColorPalette');

var _t = core._t;

var globalSelector = {
    closest: () => $(),
    all: () => $(),
    is: () => false,
};

// jQuery extensions
$.extend($.expr[':'], {
    o_editable: function (node, i, m) {
        while (node) {
            if (node.className && _.isString(node.className)) {
                if (node.className.indexOf('o_not_editable') !== -1) {
                    return false;
                }
                if (node.className.indexOf('o_editable') !== -1) {
                    return true;
                }
            }
            node = node.parentNode;
        }
        return false;
    },
});

/**
 * Management of the overlay and option list for a snippet.
 */
var SnippetEditor = Widget.extend({
    template: 'web_editor.snippet_overlay',
    xmlDependencies: ['/web_editor/static/src/xml/snippets.xml'],
    custom_events: {
        'option_update': '_onOptionUpdate',
        'user_value_widget_request': '_onUserValueWidgetRequest',
        'snippet_option_update': '_onSnippetOptionUpdate',
        'snippet_option_visibility_update': '_onSnippetOptionVisibilityUpdate',
    },

    /**
     * @constructor
     * @param {Widget} parent
     * @param {Element} target
     * @param {Object} templateOptions
     * @param {jQuery} $editable
     * @param {Object} options
     */
    init: function (parent, snippetElement, templateOptions, $editable, snippetMenu, options) {
        this._super.apply(this, arguments);
        this.options = options;
        this.$editable = $editable;
        this.$snippetBlock = $(snippetElement);
        this.$snippetBlock.data('snippet-editor', this);
        this.$body = $(document.body);
        this.templateOptions = templateOptions;
        this.isTargetParentEditable = false;
        this.isTargetMovable = false;
        this.JWEditorLib = options.JWEditorLib;
        this.wysiwyg = options.wysiwyg;
        this.editorCommands = options.wysiwyg.editorCommands;
        this.snippetMenu = snippetMenu;

        this.__isStarted = new Promise(resolve => {
            this.__isStartedResolveFunc = resolve;
        });
    },
    /**
     * @override
     */
    start: function () {
        var defs = [this._super.apply(this, arguments)];

        // Initialize the associated options (see snippets.options.js)
        defs.push(this._initializeOptions());
        var $customize = this._customize$Elements[this._customize$Elements.length - 1];

        this.isTargetParentEditable = this.$snippetBlock.parent().is(':o_editable');
        this.isTargetMovable = this.isTargetParentEditable && this.isTargetMovable;

        // Initialize move/clone/remove buttons
        if (this.isTargetMovable) {
            this.dropped = false;
            this.$el.draggable({
                greedy: true,
                appendTo: this.$body,
                cursor: 'move',
                handle: '.o_move_handle',
                cursorAt: {
                    left: 18,
                    top: 14
                },
                helper: () => {
                    var $clone = this.$el.clone().css({width: '24px', height: '24px', border: 0});
                    $clone.appendTo(this.$body).removeClass('d-none');
                    return $clone;
                },
                start: this._onDragAndDropStart.bind(this),
                stop: (...args) => {
                    // Delay our stop handler so that some summernote handlers
                    // which occur on mouseup (and are themself delayed) are
                    // executed first (this prevents the library to crash
                    // because our stop handler may change the DOM).
                    setTimeout(() => {
                        this._onDragAndDropStop(...args);
                    }, 0);
                },
            });
        } else {
            this.$('.o_overlay_move_options').addClass('d-none');
            $customize.find('.oe_snippet_clone').addClass('d-none');
        }

        if (!this.isTargetParentEditable) {
            $customize.find('.oe_snippet_remove').addClass('d-none');
        }

        var _animationsCount = 0;
        var postAnimationCover = _.throttle(() => this.cover(), 100);
        this.$snippetBlock.on('transitionstart.snippet_editor, animationstart.snippet_editor', () => {
            // We cannot rely on the fact each transition/animation start will
            // trigger a transition/animation end as the element may be removed
            // from the DOM before or it could simply be an infinite animation.
            //
            // By simplicity, for each start, we add a delayed operation that
            // will decrease the animation counter after a fixed duration and
            // do the post animation cover if none is registered anymore.
            _animationsCount++;
            setTimeout(() => {
                if (!--_animationsCount) {
                    postAnimationCover();
                }
            }, 500); // This delay have to be huge enough to take care of long
                     // animations which will not trigger an animation end event
                     // but if it is too small for some, this is the job of the
                     // animation creator to manually ask for a re-cover
        });
        // On top of what is explained above, do the post animation cover for
        // each detected transition/animation end so that the user does not see
        // a flickering when not needed.
        this.$snippetBlock.on('transitionend.snippet_editor, animationend.snippet_editor', postAnimationCover);

        return Promise.all(defs).then(() => {
            this.__isStartedResolveFunc(this);
        });
    },
    /**
     * @override
     */
    destroy: function () {
        this._super(...arguments);
        this.$snippetBlock.removeData('snippet-editor');
        this.$snippetBlock.off('.snippet_editor');
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Checks whether the snippet options are shown or not.
     *
     * @returns {boolean}
     */
    areOptionsShown: function () {
        const lastIndex = this._customize$Elements.length - 1;
        return !!this._customize$Elements[lastIndex].parent().length;
    },
    /**
     * Notifies all the associated snippet options that the snippet has just
     * been dropped in the page.
     */
    buildSnippet: async function () {
        for (var i in this.snippetOptionInstances) {
            this.snippetOptionInstances[i].onBuilt();
        }
        await this.toggleTargetVisibility(true);
    },
    /**
     * Notifies all the associated snippet options that the template which
     * contains the snippet is about to be saved.
     */
    cleanForSave: async function () {
        if (this.isDestroyed()) {
            return;
        }
        await this.toggleTargetVisibility(!this.$snippetBlock.hasClass('o_snippet_invisible'));
        const proms = _.map(this.snippetOptionInstances, option => {
            return option.cleanForSave();
        });
        await Promise.all(proms);
    },
    /**
     * Closes all widgets of all options.
     */
    closeWidgets: function () {
        if (!this.snippetOptionInstances || !this.areOptionsShown()) {
            return;
        }
        Object.keys(this.snippetOptionInstances).forEach(key => {
            this.snippetOptionInstances[key].closeWidgets();
        });
    },
    /**
     * Makes the editor overlay cover the associated snippet.
     */
    cover: function () {
        if (!this.isShown() || !this.$snippetBlock.length || !this.$snippetBlock.is(':visible')) {
            return;
        }
        var offset = this.$snippetBlock.offset();
        var manipulatorOffset = this.$el.parent().offset();
        offset.top -= manipulatorOffset.top;
        offset.left -= manipulatorOffset.left;
        this.$el.css({
            width: this.$snippetBlock.outerWidth(),
            left: offset.left,
            top: offset.top,
        });
        this.$('.o_handles').css('height', this.$snippetBlock.outerHeight());
        this.$el.toggleClass('o_top_cover', offset.top < this.$editable.offset().top);
    },
    /**
     * DOMElements have a default name which appears in the overlay when they
     * are being edited. This method retrieves this name; it can be defined
     * directly in the DOM thanks to the `data-name` attribute.
     */
    getName: function () {
        if (this.$snippetBlock.data('name') !== undefined) {
            return this.$snippetBlock.data('name');
        }
        if (this.$snippetBlock.is('img')) {
            return _t("Image");
        }
        if (this.$snippetBlock.parent('.row').length) {
            return _t("Column");
        }
        return _t("Block");
    },
    /**
     * @return {boolean}
     */
    isShown: function () {
        return this.$el && this.$el.parent().length && this.$el.hasClass('oe_active');
    },
    /**
     * @returns {boolean}
     */
    isTargetVisible: function () {
        return (this.$snippetBlock[0].dataset.invisible !== '1');
    },
    /**
     * Removes the associated snippet from the DOM and destroys the associated
     * editor (itself).
     *
     * @returns {Promise}
     */
    removeSnippet: async function () {
        await this.wysiwyg.execBatch(async ()=> {
            this.toggleOverlay(false);
            this.toggleOptions(false);

            await new Promise(resolve => {
                this.trigger_up('call_for_each_child_snippet', {
                    $snippet: this.$snippetBlock,
                    callback: function (editor, $snippet) {
                        for (var i in editor.snippetOptionInstances) {
                            editor.snippetOptionInstances[i].onRemove();
                        }
                        resolve();
                    },
                });
            });

            this.trigger_up('go_to_parent', {$snippet: this.$snippetBlock});
            var $parent = this.$snippetBlock.parent();
            this.$snippetBlock.find('*').addBack().tooltip('dispose');
            await this.editorCommands.remove(this.$snippetBlock[0]);
            this.$el.remove();

            var node = $parent[0];
            if (node && node.firstChild) {
                if (!node.firstChild.tagName && node.firstChild.textContent === ' ') {
                    this.editorCommands.remove(node.firstChild);
                }
            }

            if ($parent.closest(':data("snippet-editor")').length) {
                var editor = $parent.data('snippet-editor');
                while (!editor) {
                    var $nextParent = $parent.parent();
                    if (isEmptyAndRemovable($parent)) {
                        this.editorCommands.remove(this.$parent[0]);
                    }
                    $parent = $nextParent;
                    editor = $parent.data('snippet-editor');
                }
                if (isEmptyAndRemovable($parent, editor)) {
                    // TODO maybe this should be part of the actual Promise being
                    // returned by the function ?
                    await new Promise((resolve)=> {
                        setTimeout(() => editor.removeSnippet().then(resolve));
                    });
                }
            }

            await new Promise((resolve) => this.trigger_up('snippet_removed', {onFinish: resolve}));
            this.destroy();
            const childs = this.snippetMenu.getChildsSnippetBlock(this.$snippetBlock);
            for (const child of childs) {
                const snippetEditor = $(child).data('snippet-editor');
                if (snippetEditor) {
snippetEditor.destroy();
}
            }
            $parent.trigger('content_changed');
        });

        function isEmptyAndRemovable($el, editor) {
            editor = editor || $el.data('snippet-editor');
            return $el.children().length === 0 && $el.text().trim() === ''
                && !$el.hasClass('oe_structure') && (!editor || editor.isTargetParentEditable);
        }
    },
    /**
     * Displays/Hides the editor overlay.
     *
     * @param {boolean} show
     * @param {boolean} [previewMode=false]
     */
    toggleOverlay: function (show, previewMode) {
        if (!this.$el) {
            return;
        }

        if (previewMode) {
            // In preview mode, the sticky classes are left untouched, we only
            // add/remove the preview class when toggling/untoggling
            this.$el.toggleClass('o_we_overlay_preview', show);
        } else {
            // In non preview mode, the preview class is always removed, and the
            // sticky class is added/removed when toggling/untoggling
            this.$el.removeClass('o_we_overlay_preview');
            this.$el.toggleClass('o_we_overlay_sticky', show);
        }

        show = this.$el.hasClass('o_we_overlay_sticky') ? true : show;

        // Show/hide overlay in preview mode or not
        this.$el.toggleClass('oe_active', show);
        this.cover();
    },
    /**
     * Displays/Hides the editor (+ parent) options and call onFocus/onBlur if
     * necessary.
     *
     * @param {boolean} show
     */
    toggleOptions: function (show) {
        if (!this.$el) {
            return;
        }

        if (this.areOptionsShown() === show) {
            return;
        }
        this.trigger_up('update_customize_elements', {
            customize$Elements: show ? this._customize$Elements : [],
        });
        this._customize$Elements.forEach(($el, i) => {
            const editor = $el.data('editor');
            const options = _.chain(editor.snippetOptionInstances).values().sortBy('__order')
                            .value();
            // TODO ideally: should account the async parts of updateUI and
            // allow async parts in onFocus/onBlur.
            if (show) {
                // All onFocus before all updateUI as the onFocus of an option
                // might affect another option (like updating the $target)
                options.forEach(option => option.onFocus());
                options.forEach(option => option.updateUI());
            } else {
                options.forEach(option => option.onBlur());
            }
        });
    },
    /**
     * @param {boolean} [show]
     * @returns {Promise<boolean>}
     */
    toggleTargetVisibility: async function (show) {
        show = this._toggleVisibilityStatus(show);
        var options = _.values(this.snippetOptionInstances);
        const proms = _.sortBy(options, '__order').map(option => {
            return show ? option.onTargetShow() : option.onTargetHide();
        });
        await Promise.all(proms);
        return show;
    },
    /**
     * @param {boolean} [isTextEdition=false]
     */
    toggleTextEdition: function (isTextEdition) {
        if (this.$el) {
            this.$el.toggleClass('o_keypress', !!isTextEdition && this.isShown());
        }
    },
    /**
     * Clones the current snippet.
     *
     * @private
     * @param {boolean} recordUndo
     */
    clone: async function (recordUndo) {
        this.trigger_up('snippet_will_be_cloned', {$target: this.$snippetBlock});

        const $clonedContent = this.$snippetBlock.clone(false);

        const vNode = await this.editorCommands.insertHtml(
            [this.$snippetBlock[0], 'AFTER'],
            $clonedContent[0].outerHTML
        );
        const jwEditor = this.options.wysiwyg.editor;
        const dom = jwEditor.plugins.get(this.JWEditorLib.Dom);
        const $clone = $(dom.domMap.toDom(vNode)[0][0]);

        // todo: handle history undo in jabberwock

        await new Promise(resolve => {
            this.trigger_up('call_for_each_child_snippet', {
                $snippet: $clone,
                callback: function (editor, $snippet) {
                    for (const i in editor.snippetOptionInstances) {
                        editor.snippetOptionInstances[i].onClone({
                            isCurrent: ($snippet.is($clone)),
                        });
                    }
                    resolve();
                },
            });
        });
        this.trigger_up('snippet_cloned', {$target: $clone, $origin: this.$snippetBlock});

        $clone.trigger('content_changed');
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Instantiates the snippet's options.
     *
     * @private
     */
    _initializeOptions: function () {
        this._customize$Elements = [];
        this.snippetOptionInstances = {};
        this.selectorSiblings = [];
        this.selectorChildren = [];

        var $element = this.$snippetBlock.parent();
        while ($element.length) {
            var parentEditor = $element.data('snippet-editor');
            if (parentEditor) {
                this._customize$Elements = this._customize$Elements
                    .concat(parentEditor._customize$Elements);
                break;
            }
            $element = $element.parent();
        }

        var $optionsSection = $(core.qweb.render('web_editor.customize_block_options_section', {
            name: this.getName(),
        })).data('editor', this);
        const $optionsSectionBtnGroup = $optionsSection.find('we-button-group');
        $optionsSectionBtnGroup.contents().each((i, node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                node.parentNode.removeChild(node);
            }
        });
        $optionsSection.on('mouseenter', this._onOptionsSectionMouseEnter.bind(this));
        $optionsSection.on('mouseleave', this._onOptionsSectionMouseLeave.bind(this));
        $optionsSection.on('click', 'we-title > span', this._onOptionsSectionClick.bind(this));
        $optionsSection.on('click', '.oe_snippet_clone', this._onCloneClick.bind(this));
        $optionsSection.on('click', '.oe_snippet_remove', this._onRemoveClick.bind(this));
        this._customize$Elements.push($optionsSection);

        // TODO get rid of this when possible (made as a fix to support old
        // theme options)
        this.$el.data('$optionsSection', $optionsSection);

        var orderIndex = 0;
        var defs = _.map(this.templateOptions, option => {
            if (!option.selector.is(this.$snippetBlock)) {
                return;
            }
            if (option['drop-near']) {
                this.selectorSiblings.push(option['drop-near']);
            }
            if (option['drop-in']) {
                this.selectorChildren.push(option['drop-in']);
            }

            var optionName = option.option;
            const optionInstance = new (snippetOptions.registry[optionName] || snippetOptions.SnippetOptionWidget)(
                this,
                option.$el.children(),
                this.$snippetBlock,
                option.base_target,
                this.$el,
                _.extend({
                    optionName: optionName,
                    snippetName: this.getName(),
                }, option.data),
                this.options
            );
            var optionId = optionName || _.uniqueId('option');
            if (this.snippetOptionInstances[optionId]) {
                // If two snippet options use the same option name (and so use
                // the same JS option), store the subsequent ones with a unique
                // ID (TODO improve)
                optionId = _.uniqueId(optionId);
            }
            this.snippetOptionInstances[optionId] = optionInstance;
            optionInstance.__order = orderIndex++;
            return optionInstance.appendTo(document.createDocumentFragment());
        });

        this.isTargetMovable = (this.selectorSiblings.length > 0 || this.selectorChildren.length > 0);

        this.$el.find('[data-toggle="dropdown"]').dropdown();

        return Promise.all(defs).then(() => {
            const options = _.sortBy(this.snippetOptionInstances, '__order');
            options.forEach(option => {
                if (option.isTopOption) {
                    $optionsSectionBtnGroup.prepend(option.$el);
                } else {
                    $optionsSection.append(option.$el);
                }
            });
            $optionsSection.toggleClass('d-none', options.length === 0);
        });
    },
    /**
     * @private
     * @param {boolean} [show]
     */
    _toggleVisibilityStatus: function (show) {
        if (show === undefined) {
            show = !this.isTargetVisible();
        }
        if (show) {
            delete this.$snippetBlock[0].dataset.invisible;
        } else {
            this.$snippetBlock[0].dataset.invisible = '1';
        }
        return show;
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when the 'clone' button is clicked.
     *
     * @private
     * @param {Event} ev
     */
    _onCloneClick: function (ev) {
        ev.preventDefault();
        this.clone(true);
    },
    /**
     * Called when the snippet is starting to be dragged thanks to the 'move'
     * button.
     *
     * @private
     */
    _onDragAndDropStart: function () {
        var self = this;
        this.dropped = false;
        self.size = {
            width: self.$snippetBlock.width(),
            height: self.$snippetBlock.height()
        };
        self.$snippetBlock.after('<div class="oe_drop_clone" style="display: none;"/>');
        self.$snippetBlock.detach();
        self.$el.addClass('d-none');

        var $selectorSiblings;
        for (var i = 0; i < self.selectorSiblings.length; i++) {
            if (!$selectorSiblings) {
                $selectorSiblings = self.selectorSiblings[i].all();
            } else {
                $selectorSiblings = $selectorSiblings.add(self.selectorSiblings[i].all());
            }
        }
        var $selectorChildren;
        for (i = 0; i < self.selectorChildren.length; i++) {
            if (!$selectorChildren) {
                $selectorChildren = self.selectorChildren[i].all();
            } else {
                $selectorChildren = $selectorChildren.add(self.selectorChildren[i].all());
            }
        }

        this.trigger_up('go_to_parent', {$snippet: this.$snippetBlock});
        this.trigger_up('activate_insertion_zones', {
            $selectorSiblings: $selectorSiblings,
            $selectorChildren: $selectorChildren,
        });

        this.$body.addClass('move-important');

        this.$editable.find('.oe_drop_zone').droppable({
            over: function () {
                self.$editable.find('.oe_drop_zone.hide').removeClass('hide');
                $(this).addClass('hide').first().after(self.$snippetBlock);
                self.dropped = true;
            },
            out: function () {
                $(this).removeClass('hide');
                self.$snippetBlock.detach();
                self.dropped = false;
            },
        });
    },
    /**
     * Called when the snippet is dropped after being dragged thanks to the
     * 'move' button.
     *
     * @private
     * @param {Event} ev
     * @param {Object} ui
     */
    _onDragAndDropStop: function (ev, ui) {
        // TODO lot of this is duplicated code of the d&d feature of snippets
        if (!this.dropped) {
            var $el = $.nearest({x: ui.position.left, y: ui.position.top}, '.oe_drop_zone', {container: document.body}).first();
            if ($el.length) {
                $el.after(this.$snippetBlock);
                this.dropped = true;
            }
        }

        this.$editable.find('.oe_drop_zone').droppable('destroy').remove();

        var prev = this.$snippetBlock.first()[0].previousSibling;
        var next = this.$snippetBlock.last()[0].nextSibling;
        var $parent = this.$snippetBlock.parent();

        var $clone = this.$editable.find('.oe_drop_clone');
        if (prev === $clone[0]) {
            prev = $clone[0].previousSibling;
        } else if (next === $clone[0]) {
            next = $clone[0].nextSibling;
        }
        $clone.after(this.$snippetBlock);
        var $from = $clone.parent();

        this.$el.removeClass('d-none');
        this.$body.removeClass('move-important');
        $clone.remove();

        if (this.dropped) {
            this.trigger_up('request_history_undo_record', {$target: this.$snippetBlock});

            if (prev) {
                this.$snippetBlock.insertAfter(prev);
            } else if (next) {
                this.$snippetBlock.insertBefore(next);
            } else {
                $parent.prepend(this.$snippetBlock);
            }

            for (var i in this.snippetOptionInstances) {
                this.snippetOptionInstances[i].onMove();
            }

            this.$snippetBlock.trigger('content_changed');
            $from.trigger('content_changed');
        }

        this.trigger_up('drag_and_drop_stop', {
            $snippet: this.$snippetBlock,
        });
    },
    /**
     * @private
     */
    _onOptionsSectionMouseEnter: function (ev) {
        if (!this.$snippetBlock.is(':visible')) {
            return;
        }
        this.trigger_up('activate_snippet', {
            $element: this.$snippetBlock,
            previewMode: true,
        });
    },
    /**
     * @private
     */
    _onOptionsSectionMouseLeave: function (ev) {
        // this.trigger_up('deactivate_snippet');
    },
    /**
     * @private
     */
    _onOptionsSectionClick: function (ev) {
        this.trigger_up('activate_snippet', {
            $element: this.$snippetBlock,
            previewMode: false,
        });
    },
    /**
     * Called when a child editor/option asks for another option to perform a
     * specific action/react to a specific event.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onOptionUpdate: function (ev) {
        var self = this;

        // If multiple option names are given, we suppose it should not be
        // propagated to parent editor
        if (ev.data.optionNames) {
            ev.stopPropagation();
            _.each(ev.data.optionNames, function (name) {
                notifyForEachMatchedOption(name);
            });
        }
        // If one option name is given, we suppose it should be handle by the
        // first parent editor which can do it
        if (ev.data.optionName) {
            if (notifyForEachMatchedOption(ev.data.optionName)) {
                ev.stopPropagation();
            }
        }

        function notifyForEachMatchedOption(name) {
            var regex = new RegExp('^' + name + '\\d+$');
            var hasOption = false;
            for (var key in self.snippetOptionInstances) {
                if (key === name || regex.test(key)) {
                    self.snippetOptionInstances[key].notify(ev.data.name, ev.data.data);
                    hasOption = true;
                }
            }
            return hasOption;
        }
    },
    /**
     * Called when the 'remove' button is clicked.
     *
     * @private
     * @param {Event} ev
     */
    _onRemoveClick: function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        // todo: handle history undo in jabberwock
        this.removeSnippet();
    },
    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onSnippetOptionUpdate: async function (ev) {
        if (ev.data.previewMode) {
            ev.data.onSuccess();
            return;
        }

        const proms1 = Object.keys(this.snippetOptionInstances).map(key => {
            return this.snippetOptionInstances[key].updateUI({
                forced: ev.data.widget,
                noVisibility: true,
            });
        });
        await Promise.all(proms1);

        const proms2 = Object.keys(this.snippetOptionInstances).map(key => {
            return this.snippetOptionInstances[key].updateUIVisibility();
        });
        await Promise.all(proms2);

        ev.data.onSuccess();
    },
    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onSnippetOptionVisibilityUpdate: function (ev) {
        ev.data.show = this._toggleVisibilityStatus(ev.data.show);
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onUserValueWidgetRequest: function (ev) {
        ev.stopPropagation();
        for (const key of Object.keys(this.snippetOptionInstances)) {
            const widget = this.snippetOptionInstances[key].findWidget(ev.data.name);
            if (widget) {
                ev.data.onSuccess(widget);
                return;
            }
        }
    },
});
var SnippetsMenu = Widget.extend({
    id: 'oe_snippets',
    cacheSnippetTemplate: {},
    events: {
        'click .o_install_btn': '_onInstallBtnClick',
        'click .o_we_add_snippet_btn': '_onBlocksTabClick',
        'click .o_we_invisible_entry': '_onInvisibleEntryClick',
        'click #snippet_custom .o_delete_btn': '_onDeleteBtnClick',
        'mousedown': '_onMouseDown',
    },
    custom_events: {
        'activate_insertion_zones': '_onActivateInsertionZones',
        'activate_snippet': '_onActivateSnippet',
        'call_for_each_child_snippet': '_onCallForEachChildSnippet',
        'clone_snippet': '_onCloneSnippet',
        'cover_update': '_onOverlaysCoverUpdate',
        'deactivate_snippet': '_onDeactivateSnippet',
        'drag_and_drop_stop': '_onDragAndDropStop',
        'get_snippet_versions': '_onGetSnippetVersions',
        'go_to_parent': '_onGoToParent',
        'remove_snippet': '_onRemoveSnippet',
        'snippet_edition_request': '_onSnippetEditionRequest',
        'snippet_removed': '_onSnippetRemoved',
        'snippet_cloned': '_onSnippetCloned',
        'snippet_option_visibility_update': '_onSnippetOptionVisibilityUpdate',
        'request_save': '_onSaveRequest',
        'update_customize_elements': '_onUpdateCustomizeElements',
        'hide_overlay': '_onHideOverlay',
        'block_preview_overlays': '_onBlockPreviewOverlays',
        'unblock_preview_overlays': '_onUnblockPreviewOverlays',
        'user_value_widget_opening': '_onUserValueWidgetOpening',
        'reload_snippet_template': '_onReloadSnippetTemplate',
    },
    // enum of the SnippetsMenu's tabs.
    tabs: {
        BLOCKS: 'blocks',
        OPTIONS: 'options',
    },

    /**
     * @param {Widget} parent
     * @param {Object} [options]
     * @param {string} [options.snippets]
     *      URL of the snippets template. This URL might have been set
     *      in the global 'snippets' variable, otherwise this function
     *      assigns a default one.
     *      default: 'web_editor.snippets'
     *
     * @constructor
     */
    init: function (parent, options) {
        this._super.apply(this, arguments);
        options = options || {};
        this.trigger_up('getRecordInfo', {
            recordInfo: options,
            callback: function (recordInfo) {
                _.defaults(options, recordInfo);
            },
        });

        this.options = options;
        if (!this.options.snippets) {
            this.options.snippets = 'web_editor.snippets';
        }
        this.snippetEditors = [];

        this._mutex = new concurrency.Mutex();

        this.selectorEditableArea = options.selectorEditableArea;
        this.$editor = options.$el;
        this.$body = this.$editor.closest('body');

        this.editorCommands = this.options.wysiwyg.editorCommands;

        this.JWEditorLib = options.JWEditorLib;
        if (this.JWEditorLib) {
            const jwEditor = this.options.wysiwyg.editor;
            const layout = jwEditor.plugins.get(this.JWEditorLib.Layout);
            this.layoutEngine = layout.engines.dom;
            this.nodeToEditor = new Map();
        }

        this._notActivableElementsSelector = [
            '#web_editor-top-edit',
            '#oe_snippets',
            '#oe_manipulators',
            '.o_technical_modal',
            '.oe_drop_zone',
            '.o_notification_manager',
            '.o_we_no_overlay',
            '.ui-autocomplete',
            '.modal .close',
            '.o_we_crop_widget',
        ].join(', ');

        this.$snippetEditorArea = options.$snippetEditorArea;
    },
    /**
     * @override
     */
    willStart: function () {
        // Preload colorpalette dependencies without waiting for them. The
        // widget have huge chances of being used by the user (clicking on any
        // text will load it). The colorpalette itself will do the actual
        // waiting of the loading completion.
        ColorPaletteWidget.loadDependencies(this);
        return this._super(...arguments);
    },
    /**
     * @override
     */
    start: function () {
        var defs = [this._super.apply(this, arguments)];
        this.ownerDocument = this.$el[0].ownerDocument;
        this.$document = $(this.ownerDocument);
        this.window = this.ownerDocument.defaultView;
        this.$window = $(this.window);

        this.customizePanel = document.createElement('div');
        this.customizePanel.classList.add('o_we_customize_panel', 'd-none');

        this.invisibleDOMPanelEl = document.createElement('div');
        this.invisibleDOMPanelEl.classList.add('o_we_invisible_el_panel');
        this.invisibleDOMPanelEl.appendChild(
            $('<div/>', {
                text: _t('Invisible Elements'),
                class: 'o_panel_header',
            }).prepend(
                $('<i/>', {class: 'fa fa-eye-slash'})
            )[0]
        );

        this._addTabLoading(this.tabs.BLOCKS);

        // Fetch snippet templates and compute it
        defs.push(this._loadSnippetsTemplates().then(() => {
            return this._updateInvisibleDOM();
        }));

        core.bus.on('deactivate_snippet', this, this._onDeactivateSnippet);

        var lastElement;
        this.$document.on('click.snippets_menu', '*', ev => {
            var srcElement = ev.target || (ev.originalEvent && (ev.originalEvent.target || ev.originalEvent.originalTarget)) || ev.srcElement;
            if (!srcElement || lastElement === srcElement) {
                return;
            }
            lastElement = srcElement;
            _.defer(function () {
                lastElement = false;
            });
            var $snippet = $(srcElement);
            if (!$snippet.closest('we-button, we-toggler, .o_we_color_preview').length) {
                this._closeWidgets();
            }
            if (!$snippet.closest('body > *').length) {
                return;
            }
            if ($snippet.closest(this._notActivableElementsSelector).length) {
                return;
            }
            this._activateSnippet($snippet);

        });


        // Adapt overlay covering when the window is resized / content changes
        var throttledCoverUpdate = _.throttle(() => {
            this.updateCurrentSnippetEditorOverlay();
        }, 50);
        this.$window.on('resize.snippets_menu', throttledCoverUpdate);
        this.$window.on('content_changed.snippets_menu', throttledCoverUpdate);

        // On keydown add a class on the active overlay to hide it and show it
        // again when the mouse moves
        this.$document.on('keydown.snippets_menu', () => {
            this.snippetEditors.forEach(editor => {
                editor.toggleTextEdition(true);
            });
        });
        this.$document.on('mousemove.snippets_menu, mousedown.snippets_menu', () => {
            this.snippetEditors.forEach(editor => {
                editor.toggleTextEdition(false);
            });
        });

        // Auto-selects text elements with a specific class and remove this
        // on text changes
        this.$document.on('click.snippets_menu', '.o_default_snippet_text', function (ev) {
            $(ev.target).closest('.o_default_snippet_text').removeClass('o_default_snippet_text');
            $(ev.target).selectContent();
            $(ev.target).removeClass('o_default_snippet_text');
        });

        const $autoFocusEls = $('.o_we_snippet_autofocus');
        if ($autoFocusEls.length) {
            this._activateSnippet($autoFocusEls.first());
        }

        // hand
        return Promise.all(defs).then(() => {
            this.$('[data-title]').tooltip({
                delay: 0,
                title: function () {
                    return this.classList.contains('active') ? false : this.dataset.title;
                },
            });
        });
    },
    /**
     * @override
     */
    destroy: function () {
        this._super.apply(this, arguments);
        if (this.$window) {
            this.$window.off('.snippets_menu');
            this.$document.off('.snippets_menu');
        }
        core.bus.off('deactivate_snippet', this, this._onDeactivateSnippet);
        delete this.cacheSnippetTemplate[this.options.snippets];
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Prepares the page so that it may be saved:
     * - Asks the snippet editors to clean their associated snippet
     * - Remove the 'contentEditable' attributes
     */
    cleanForSave: async function () {
        this.trigger_up('ready_to_clean_for_save');
    },
    /**
     * Load snippets.
     * @param {boolean} invalidateCache
     */
    loadSnippets: function (invalidateCache) {
        if (!invalidateCache && this.cacheSnippetTemplate[this.options.snippets]) {
            this._defLoadSnippets = this.cacheSnippetTemplate[this.options.snippets];
            return this._defLoadSnippets;
        }
        this._defLoadSnippets = this._rpc({
            model: 'ir.ui.view',
            method: 'render_public_asset',
            args: [this.options.snippets, {}],
            kwargs: {
                context: this.options.context,
            },
        });
        this.cacheSnippetTemplate[this.options.snippets] = this._defLoadSnippets;
        return this._defLoadSnippets;
    },
    /**
     * Updates the cover dimensions of the current snippet editor.
     */
    updateCurrentSnippetEditorOverlay: function () {
        this.snippetEditors = _.filter(this.snippetEditors, function (snippetEditor) {
            if (snippetEditor.$snippetBlock.closest('body').length) {
                snippetEditor.cover();
                return true;
            }
            snippetEditor.destroy();
        });
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    afterRender: function () {
        this.snippetEditors = this.snippetEditors.filter(x=>!x.isDestroyed());
        for (const editor of this.snippetEditors) {
            if (!editor.vNode) continue;
            if (!this.layoutEngine.getDomNodes(editor.vNode)) debugger;

            const $snippetBlock = $(this.layoutEngine.getDomNodes(editor.vNode)[0][0]);
            editor.$snippetBlock = $snippetBlock;
            editor.$snippetBlock.data('snippet-editor', editor);
        }
        // We need to do another loop because, side effects of an option
        // setTarget access the $snippetBlock of the editor that would not
        // be set otherwise.
        for (const editor of this.snippetEditors) {
            if (!editor.vNode) continue;
            for (const key in editor.snippetOptionInstances) {
                const $snippetBlock = $(this.layoutEngine.getDomNodes(editor.vNode)[0][0]);
                editor.snippetOptionInstances[key].setTarget($snippetBlock);
            }
        }
        // debugger
        // let currentNode = this.includedSnippetNodes[0];
        // const jwEditor = this.options.wysiwyg.editor;
        // const dom = jwEditor.plugins.get(JWEditorLib.Dom);
        // while (currentNode) {
        //     currentNode = this.includedSnippetNodes.shift();
        //     const domNodes = dom.domMap.toDom(currentNode);
        // }
    },
    /**
     * Creates drop zones in the DOM (locations where snippets may be dropped).
     * Those locations are determined thanks to the two types of given DOM.
     *
     * @private
     * @param {jQuery} [$selectorSiblings]
     *        elements which must have siblings drop zones
     * @param {jQuery} [$selectorChildren]
     *        elements which must have child drop zones between each of existing
     *        child
     */
    _activateInsertionZones: function ($selectorSiblings, $selectorChildren) {
        var self = this;

        function isFullWidth($elem) {
            return $elem.parent().width() === $elem.outerWidth(true);
        }

        if ($selectorChildren) {
            $selectorChildren.each(function () {
                var $zone = $(this);
                var style;
                var vertical;
                var node;
                var css = self.window.getComputedStyle(this);
                var parentCss = self.window.getComputedStyle($zone.parent()[0]);
                var float = css.float || css.cssFloat;
                var parentDisplay = parentCss.display;
                var parentFlex = parentCss.flexDirection;

                style = {};
                vertical = false;
                node = $zone[0].lastChild;
                var test = !!(node && ((!node.tagName && node.textContent.match(/\S/)) || node.tagName === 'BR'));
                if (test) {
                    vertical = true;
                    style['float'] = 'none';
                    style['height'] = parseInt(self.window.getComputedStyle($zone[0]).lineHeight) + 'px';
                    style['display'] = 'inline-block';
                } else if (float === 'left' || float === 'right' || (parentDisplay === 'flex' && parentFlex === 'row')) {
                    style['float'] = float;
                    if (!isFullWidth($zone) && !$zone.hasClass('oe_structure')) {
                        vertical = true;
                        style['height'] = Math.max($zone.outerHeight(), 30) + 'px';
                    }
                }
                self._insertDropzone($('<we-hook/>').appendTo($zone), vertical, style);

                style = {};
                vertical = false;
                node = $zone[0].firstChild;
                test = !!(node && ((!node.tagName && node.textContent.match(/\S/)) || node.tagName === 'BR'));
                if (test) {
                    vertical = true;
                    style['float'] = 'none';
                    style['height'] = parseInt(self.window.getComputedStyle($zone[0]).lineHeight) + 'px';
                    style['display'] = 'inline-block';
                } else if (float === 'left' || float === 'right' || (parentDisplay === 'flex' && parentFlex === 'row')) {
                    style['float'] = float;
                    if (!isFullWidth($zone) && !$zone.hasClass('oe_structure')) {
                        vertical = true;
                        style['height'] = Math.max($zone.outerHeight(), 30) + 'px';
                    }
                }
                self._insertDropzone($('<we-hook/>').prependTo($zone), vertical, style);
            });

            // add children near drop zone
            $selectorSiblings = $(_.uniq(($selectorSiblings || $()).add($selectorChildren.children()).get()));
        }

        if ($selectorSiblings) {
            $selectorSiblings.filter(':not(.oe_drop_zone):not(.oe_drop_clone)').each(function () {
                var $zone = $(this);
                var style;
                var vertical;
                var css = self.window.getComputedStyle(this);
                var parentCss = self.window.getComputedStyle($zone.parent()[0]);
                var float = css.float || css.cssFloat;
                var parentDisplay = parentCss.display;
                var parentFlex = parentCss.flexDirection;

                if ($zone.prev('.oe_drop_zone:visible').length === 0) {
                    style = {};
                    vertical = false;
                    if (float === 'left' || float === 'right' || (parentDisplay === 'flex' && parentFlex === 'row')) {
                        style['float'] = float;
                        if (!isFullWidth($zone)) {
                            vertical = true;
                            style['height'] = Math.max($zone.outerHeight(), 30) + 'px';
                        }
                    }
                    self._insertDropzone($('<we-hook/>').insertBefore($zone), vertical, style);
                }
                if ($zone.next('.oe_drop_zone:visible').length === 0) {
                    style = {};
                    vertical = false;
                    if (float === 'left' || float === 'right' || (parentDisplay === 'flex' && parentFlex === 'row')) {
                        style['float'] = float;
                        if (!isFullWidth($zone)) {
                            vertical = true;
                            style['height'] = Math.max($zone.outerHeight(), 30) + 'px';
                        }
                    }
                    self._insertDropzone($('<we-hook/>').insertAfter($zone), vertical, style);
                }
            });
        }

        var count;
        var $zones;
        do {
            count = 0;
            $zones = this.$editor.find('.oe_drop_zone > .oe_drop_zone').remove(); // no recursive zones
            count += $zones.length;
            $zones.remove();
        } while (count > 0);

        // Cleaning consecutive zone and up zones placed between floating or
        // inline elements. We do not like these kind of zones.
        $zones = this.$editor.find('.oe_drop_zone:not(.oe_vertical)');
        $zones.each(function () {
            var zone = $(this);
            var prev = zone.prev();
            var next = zone.next();
            // remove consecutive zone
            if (prev.is('.oe_drop_zone') || next.is('.oe_drop_zone')) {
                zone.remove();
                return;
            }
            var floatPrev = prev.css('float') || 'none';
            var floatNext = next.css('float') || 'none';
            var dispPrev = prev.css('display') || null;
            var dispNext = next.css('display') || null;
            if ((floatPrev === 'left' || floatPrev === 'right')
             && (floatNext === 'left' || floatNext === 'right')) {
                zone.remove();
            } else if (dispPrev !== null && dispNext !== null
             && dispPrev.indexOf('inline') >= 0 && dispNext.indexOf('inline') >= 0) {
                zone.remove();
            }
        });
    },
    /**
     * @private
     * @param {this.tabs.VALUE} [tab='OPTIONS'] - the tab to select
     */
    _addTabLoading: function (tab) {
        const loadingEl = document.createElement('div');
        loadingEl.classList.add('o_we_ui_loading', 'text-center', 'pt-5');
        const loadingIconEl = document.createElement('i');
        loadingIconEl.classList.add('fa', 'fa-circle-o-notch', 'fa-spin', 'fa-3x');
        loadingEl.appendChild(loadingIconEl);
        this._updateLeftPanelContent({
            content: loadingEl,
            tab: tab || this.tabs.OPTIONS,
        });
    },
    /**
     * Adds an entry for every invisible snippet in the left panel box.
     * The entries will contains an 'Edit' button to activate their snippet.
     *
     * @private
     * @returns {Promise}
     */
    _updateInvisibleDOM: function () {
        return this._mutex.exec(() => {
            this.invisibleDOMMap = new Map();
            const $invisibleDOMPanelEl = $(this.invisibleDOMPanelEl);
            $invisibleDOMPanelEl.find('.o_we_invisible_entry').remove();
            const $invisibleSnippets = this.$editor.find('.o_snippet_invisible').addBack('.o_snippet_invisible');

            $invisibleDOMPanelEl.toggleClass('d-none', !$invisibleSnippets.length);

            const proms = _.map($invisibleSnippets, async el => {
                const editor = await this._getOrCreateSnippetEditor($(el));
                const $invisEntry = $('<div/>', {
                    class: 'o_we_invisible_entry d-flex align-items-center justify-content-between',
                    text: editor.getName(),
                }).append($('<i/>', {class: `fa ${editor.isTargetVisible() ? 'fa-eye' : 'fa-eye-slash'} ml-2`}));
                $invisibleDOMPanelEl.append($invisEntry);
                this.invisibleDOMMap.set($invisEntry[0], el);
            });
            return Promise.all(proms);
        });
    },
    /**
     * Disable the overlay editor of the active snippet and activate the new one.
     * Note 1: if the snippet editor associated to the given snippet is not
     *         created yet, this method will create it.
     * Note 2: if the given DOM element is not a snippet (no editor option), the
     *         first parent which is one is used instead.
     *
     * @param {jQuery|false} $snippetBlock
     *        The DOM element whose editor (and its parent ones) need to be
     *        enabled. Only disable the current one if false is given.
     * @param {boolean} [previewMode=false]
     * @param {boolean} [ifInactiveOptions=false]
     * @returns {Promise<SnippetEditor>}
     *          (might be async when an editor must be created)
     */
    _activateSnippet: async function ($snippetBlock, previewMode, ifInactiveOptions) {
        if (this._blockPreviewOverlays && previewMode) {
            return;
        }
        if (!$snippetBlock.is(':visible')) {
            return;
        }

        let enabledEditorHierarchy = [];

        return this._mutex.exec(async () => {
            let editorToEnable;
            // Take the first parent of the provided DOM (or itself) which
            // should have an associated snippet editor and create + enable it.
            if ($snippetBlock.length) {
                const $snippet = globalSelector.closest($snippetBlock);
                if ($snippet.length) {
                    editorToEnable = await this._getOrCreateSnippetEditor($snippet);
                }
            }
            if (ifInactiveOptions && enabledEditorHierarchy.includes(editorToEnable)) {
                return editorToEnable;
            }

            const editorToEnableHierarchy = [];
            let currentEditor = editorToEnable;
            while (currentEditor && currentEditor.$snippetBlock) {
                editorToEnableHierarchy.push(currentEditor);
                currentEditor = currentEditor.getParent();
            }


            // First disable all editors...
            this._disableAllEditors(previewMode, editorToEnableHierarchy);

            // ... then enable the right editor
            if (editorToEnable) {
                //setTimeout(()=>{
                editorToEnable.toggleOverlay(true, previewMode);
                editorToEnable.toggleOptions(true);
                //}, 100)
            }

            enabledEditorHierarchy = editorToEnableHierarchy;
            return editorToEnable;
        });
    },

    _disableAllEditorsWithMutex() {
        this._mutex.exec(this._disableAllEditors.bind(this));
    },
    _disableAllEditors(previewMode = false, editorToEnableHierarchy) {
        for (let i = this.snippetEditors.length; i--;) {
            const editor = this.snippetEditors[i];
            editor.toggleOverlay(false, previewMode);
            if (!previewMode && !(editorToEnableHierarchy && editorToEnableHierarchy.includes(editor))) {
                editor.toggleOptions(false);
            }
        }
    },
    /**
     * @private
     * @param {boolean} invalidateCache
     */
    _loadSnippetsTemplates: async function (invalidateCache) {
        return this._mutex.exec(async () => {
            await this._destroyEditors();
            const html = await this.loadSnippets(invalidateCache);
            await this._computeSnippetTemplates(html);
        });
    },
    /**
     * @private
     */
    _destroyEditors: async function () {
        const proms = _.map(this.snippetEditors, async function (snippetEditor) {
            await snippetEditor.cleanForSave();
            snippetEditor.destroy();
        });
        await Promise.all(proms);
        this.snippetEditors.splice(0);
    },
    /**
     * Calls a given callback 'on' the given snippet and all its child ones if
     * any (DOM element with options).
     *
     * Note: the method creates the snippet editors if they do not exist yet.
     *
     * @private
     * @param {jQuery} $snippet
     * @param {function} callback
     *        Given two arguments: the snippet editor associated to the snippet
     *        being managed and the DOM element of this snippet.
     * @returns {Promise} (might be async if snippet editors need to be created
     *                     and/or the callback is async)
     */
    _callForEachChildSnippet: function ($snippetBlock, callback) {
        const defs = _.map(this.getChildsSnippetBlock($snippetBlock), async (child) => {
            const $childSnippet = $(child);
            const editor = await this._getOrCreateSnippetEditor($childSnippet);
            if (editor) {
                return callback.call(this, editor, $childSnippet);
            }
        });
        return Promise.all(defs);
    },

    getChildsSnippetBlock($snippetBlock) {
        return $snippetBlock.add(globalSelector.all($snippetBlock));
    },
    /**
     * Close widget for all editors.
     *
     * @private
     */
    _closeWidgets: function () {
        this.snippetEditors.forEach(editor => editor.closeWidgets());
    },
    /**
     * Creates and returns a set of helper functions which can help finding
     * snippets in the DOM which match some parameters (typically parameters
     * given by a snippet option). The functions are:
     *
     * - `is`: to determine if a given DOM is a snippet that matches the
     *         parameters
     *
     * - `closest`: find closest parent (or itself) of a given DOM which is a
     *              snippet that matches the parameters
     *
     * - `all`: find all snippets in the DOM that match the parameters
     *
     * See implementation for function details.
     *
     * @private
     * @param {string} selector
     *        jQuery selector that DOM elements must match to be considered as
     *        potential snippet.
     * @param {string} exclude
     *        jQuery selector that DOM elements must *not* match to be
     *        considered as potential snippet.
     * @param {string|false} target
     *        jQuery selector that at least one child of a DOM element must
     *        match to that DOM element be considered as a potential snippet.
     * @param {boolean} noCheck
     *        true if DOM elements which are technically not in an editable
     *        environment may be considered.
     * @param {boolean} isChildren
     *        when the DOM elements must be in an editable environment to be
     *        considered (@see noCheck), this is true if the DOM elements'
     *        parent must also be in an editable environment to be considered.
     */
    _computeSelectorFunctions: function (selector, exclude, target, noCheck, isChildren) {
        var self = this;

        exclude += `${exclude && ', '}.o_snippet_not_selectable`;

        let filterFunc = function () {
            return !$(this).is(exclude);
        };
        if (target) {
            const oldFilter = filterFunc;
            filterFunc = function () {
                return oldFilter.apply(this) && $(this).find(target).length !== 0;
            };
        }

        // Prepare the functions
        var functions = {
            is: function ($from) {
                return $from.is(selector) && $from.filter(filterFunc).length !== 0;
            },
        };
        if (noCheck) {
            functions.closest = function ($from, parentNode) {
                return $from.closest(selector, parentNode).filter(filterFunc);
            };
            functions.all = function ($from) {
                return ($from ? dom.cssFind($from, selector) : $(selector)).filter(filterFunc);
            };
        } else {
            functions.closest = function ($from, parentNode) {
                var editors = self.$editor.get();
                return $from.closest(selector, parentNode).filter(function () {
                    var node = this;
                    while (node.parentNode) {
                        if (editors.indexOf(node) !== -1) {
                            return true;
                        }
                        node = node.parentNode;
                    }
                    return false;
                }).filter(filterFunc);
            };
            functions.all = isChildren ? function ($from) {
                return dom.cssFind($from || self.$editor, selector).filter(filterFunc);
            } : function ($from) {
                $from = $from || self.$editor;
                return $from.filter(selector).add(dom.cssFind($from, selector)).filter(filterFunc);
            };
        }
        return functions;
    },
    /**
     * Processes the given snippet template to register snippet options, creates
     * draggable thumbnail, etc.
     *
     * @private
     * @param {string} html
     */
    _computeSnippetTemplates: async function (html) {
        var self = this;
        var $html = $(html);
        var $scroll = $html.siblings('#o_scroll');

        $html.find('[data-oe-type="snippet"]').each(function () {
            $(this).children()
                .attr('data-oe-type', 'snippet')
                .attr('data-oe-thumbnail', $(this).data('oe-thumbnail'));
        });

        this.templateOptions = [];
        var selectors = [];
        var $dataSelectors = $html.find('[data-selector]');
        $dataSelectors.each(function () {
            var $dataSelector = $(this);
            var selector = $dataSelector.data('selector');
            var exclude = $dataSelector.data('exclude') || '';
            var target = $dataSelector.data('target');
            var noCheck = $dataSelector.data('no-check');
            var optionID = $dataSelector.data('js');
            var option = {
                'option': optionID,
                'base_selector': selector,
                'base_exclude': exclude,
                'base_target': target,
                'selector': self._computeSelectorFunctions(selector, exclude, target, noCheck),
                '$el': $dataSelector,
                'drop-near': $dataSelector.data('drop-near') && self._computeSelectorFunctions($dataSelector.data('drop-near'), '', false, noCheck, true),
                'drop-in': $dataSelector.data('drop-in') && self._computeSelectorFunctions($dataSelector.data('drop-in'), '', false, noCheck),
                'data': _.extend({string: $dataSelector.attr('string')}, $dataSelector.data()),
            };
            self.templateOptions.push(option);
            selectors.push(option.selector);
        });
        $dataSelectors.addClass('d-none');

        globalSelector.closest = function ($from) {
            var $temp;
            var $target;
            for (var i = 0, len = selectors.length; i < len; i++) {
                $temp = selectors[i].closest($from, $target && $target[0]);
                if ($temp.length) {
                    $target = $temp;
                }
            }
            return $target || $();
        };
        globalSelector.all = function ($from) {
            var $target = $();
            for (var i = 0, len = selectors.length; i < len; i++) {
                $target = $target.add(selectors[i].all($from));
            }
            return $target;
        };
        globalSelector.is = function ($from) {
            console.log("from2", $from.get());
            for (var i = 0, len = selectors.length; i < len; i++) {
                if (selectors[i].is($from)) {
                    return true;
                }
            }
            return false;
        };

        this.$snippets = $scroll.find('.o_panel_body').children()
            .addClass('oe_snippet')
            .each(function () {
                var $snippet = $(this);
                var name = $snippet.attr('name');
                var $snippetBody = $snippet.children(':not(.oe_snippet_thumbnail)').addClass('oe_snippet_body');
                const isCustomSnippet = !!$snippet.parents('#snippet_custom').length;

                // Associate in-page snippets to their name
                if ($snippetBody.length) {
                    var snippetClasses = $snippetBody.attr('class').match(/s_[^ ]+/g);
                    if (snippetClasses && snippetClasses.length) {
                        snippetClasses = '.' + snippetClasses.join('.');
                    }
                    var $els = $(snippetClasses).not('[data-name]').add($snippetBody);
                    $els.attr('data-name', name).data('name', name);
                }

                // Create the thumbnail
                if ($snippet.find('.oe_snippet_thumbnail').length) {
                    return; // Compatibility with elements which do not use 't-snippet'
                }
                var $thumbnail = $(_.str.sprintf(
                    '<div class="oe_snippet_thumbnail">' +
                        '<div class="oe_snippet_thumbnail_img" style="background-image: url(%s);"/>' +
                        '<span class="oe_snippet_thumbnail_title">%s</span>' +
                    '</div>',
                    $snippet.find('[data-oe-thumbnail]').data('oeThumbnail'),
                    name
                ));
                if (isCustomSnippet) {
                    const btn = document.createElement('we-button');
                    btn.dataset.snippetId = $snippet.data('oeSnippetId');
                    btn.classList.add('o_delete_btn', 'fa', 'fa-trash');
                    $thumbnail.prepend(btn);
                    $thumbnail.prepend($('<div class="o_image_ribbon"/>'));
                }
                $snippet.prepend($thumbnail);

                // Create the install button (t-install feature) if necessary
                var moduleID = $snippet.data('moduleId');
                if (moduleID) {
                    $snippet.addClass('o_snippet_install');
                    $thumbnail.append($('<button/>', {
                        class: 'btn btn-primary o_install_btn w-100',
                        type: 'button',
                        text: _t("Install"),
                    }));
                }
            })
            .not('[data-module-id]');

        // Hide scroll if no snippets defined
        if (!this.$snippets.length) {
            this.$el.detach();
        }

        // Remove branding from template
        _.each($html.find('[data-oe-model], [data-oe-type]'), function (el) {
            for (var k = 0; k < el.attributes.length; k++) {
                if (el.attributes[k].name.indexOf('data-oe-') === 0) {
                    $(el).removeAttr(el.attributes[k].name);
                    k--;
                }
            }
        });

        // Force non editable part to contentEditable=false
        $html.find('.o_not_editable').attr('contentEditable', false);

        // Add the computed template and make elements draggable
        this.$el.html($html);
        this.$el.append(this.customizePanel);
        this.$el.append(this.invisibleDOMPanelEl);
        this._makeSnippetDraggable(this.$snippets);
        await this._disableUndroppableSnippets();

        this.$el.addClass('o_loaded');
        $('body.editor_enable').addClass('editor_has_snippets');
        this.trigger_up('snippets_loaded', self.$el);
    },
    /**
     * Creates a snippet editor to associated to the given snippet. If the given
     * snippet already has a linked snippet editor, the function only returns
     * that one.
     * The function also instantiates a snippet editor for all snippet parents
     * as a snippet editor must be able to display the parent snippet options.
     *
     * @private
     * @param {jQuery} $snippet
     * @returns {Promise<SnippetEditor>}
     */
    _getOrCreateSnippetEditor: async function ($snippet) {
        // todo: the $snippet might be redrawn frequently with the jabberwock.
        //        adapt this code to use a Map<VNode, Editor> instead.
        var snippetEditor = $snippet.data('snippet-editor');
        if (snippetEditor) {
            return snippetEditor.__isStarted;
        }

        var $parent = globalSelector.closest($snippet.parent());
        let parentEditor;
        if ($parent.length) {
            parentEditor = await this._getOrCreateSnippetEditor($parent);
        }

        // When reaching this position, after the Promise resolution, the
        // snippet editor instance might have been created by another call
        // to _getOrCreateSnippetEditor... the whole logic should be improved
        // to avoid doing this here.
        if (snippetEditor) {
            return snippetEditor.__isStarted;
        }

        let editableArea = this.$editor;
        snippetEditor = new SnippetEditor(parentEditor || this,
            $snippet,
            this.templateOptions,
            $snippet.closest('[data-oe-type="html"], .oe_structure').add(editableArea),
            this,
            this.options);
        this.snippetEditors.push(snippetEditor);
        await snippetEditor.appendTo(this.$snippetEditorArea);

        return snippetEditor;
    },
    /**
     * There may be no location where some snippets might be dropped. This mades
     * them appear disabled in the menu.
     *
     * @todo make them undraggable
     * @private
     */
    _disableUndroppableSnippets: async function () {
        var self = this;
        var cache = {};
        for (const snippetDraggable of this.$snippets.toArray()) {
            var $snippetDraggable = $(snippetDraggable);
            var $snippetTemplate = $snippetDraggable.find('.oe_snippet_body');

            var isEnabled = false;
            // console.log('self.templateOptions:', self.templateOptions)
            _.each(self.templateOptions, function (option, k) {
                if (isEnabled || !($snippetTemplate.is(option.base_selector) && !$snippetTemplate.is(option.base_exclude))) {
                    return;
                }

                cache[k] = cache[k] || {
                    'drop-near': option['drop-near'] ? option['drop-near'].all().length : 0,
                    'drop-in': option['drop-in'] ? option['drop-in'].all().length : 0
                };
                isEnabled = (cache[k]['drop-near'] || cache[k]['drop-in']);
            });
            await this.editor.execCommand(isEnabled ? 'dom.removeClass' : 'dom.addClass', {
                domNode: snippetDraggable,
                class: 'o_disabled',
             });
        }
    },
    /**
     * Creates a dropzone element and inserts it by replacing the given jQuery
     * location. This allows to add data on the dropzone depending on the hook
     * environment.
     *
     * @private
     * @param {jQuery} $hook
     * @param {boolean} [vertical=false]
     * @param {Object} [style]
     */
    _insertDropzone: function ($hook, vertical, style) {
        var $dropzone = $('<div/>', {
            'class': 'oe_drop_zone oe_insert' + (vertical ? ' oe_vertical' : ''),
        });
        if (style) {
            $dropzone.css(style);
        }
        $hook.replaceWith($dropzone);
        return $dropzone;
    },
    /**
     * Make given snippets be draggable/droppable thanks to their thumbnail.
     *
     * @private
     * @param {jQuery} $snippets
     */
    _makeSnippetDraggable: function ($snippets) {
        var self = this;
        var $tumb = $snippets.find('.oe_snippet_thumbnail_img:first');
        var $snippetToInsert, dropped, $snippet;

        $snippets.draggable({
            greedy: true,
            helper: function () {
                const dragSnip = this.cloneNode(true);
                dragSnip.querySelectorAll('.o_delete_btn, .o_image_ribbon').forEach(el => el.remove());
                return dragSnip;
            },
            appendTo: this.$body,
            cursor: 'move',
            distance: 0,
            handle: '.oe_snippet_thumbnail',
            start: function () {
                dropped = false;
                $snippet = $(this);
                var $baseBody = $snippet.find('.oe_snippet_body');
                var $selectorSiblings = $();
                var $selectorChildren = $();
                for (const option of self.templateOptions) {
                    if ($baseBody.is(option.base_selector) && !$baseBody.is(option.base_exclude)) {
                        if (option['drop-near']) {
                            $selectorSiblings = $selectorSiblings.add(option['drop-near'].all());
                        }
                        if (option['drop-in']) {
                            $selectorChildren = $selectorChildren.add(option['drop-in'].all());
                        }
                    }
                }

                $snippetToInsert = $baseBody.clone();

                if (!$selectorSiblings.length && !$selectorChildren.length) {
                    console.warn($snippet.find('.oe_snippet_thumbnail_title').text() + " have not insert action: data-drop-near or data-drop-in");
                    return;
                }

                self._disableAllEditorsWithMutex();
                self._activateInsertionZones($selectorSiblings, $selectorChildren);

                self.$editor.find('.oe_drop_zone').droppable({
                    over: function () {
                        if (!dropped) {
                            dropped = true;
                            $(this).first().after($snippetToInsert).addClass('d-none');
                            $snippetToInsert.removeClass('oe_snippet_body');
                        }
                    },
                    out: function () {
                        var prev = $snippetToInsert.prev();
                        if (this === prev[0]) {
                            dropped = false;
                            $snippetToInsert.detach();
                            $(this).removeClass('d-none');
                            $snippetToInsert.addClass('oe_snippet_body');
                        }
                    },
                });
            },
            stop: function (ev, ui) {
                $snippetToInsert.removeClass('oe_snippet_body');

                if (!dropped && ui.position.top > 3 && ui.position.left + 50 > self.$el.outerWidth()) {
                    var $el = $.nearest({x: ui.position.left, y: ui.position.top}, '.oe_drop_zone', {container: document.body}).first();
                    if ($el.length) {
                        $el.after($snippetToInsert);
                        dropped = true;
                    }
                }

                self.$editor.find('.oe_drop_zone').droppable('destroy').remove();

                if (dropped) {
                    var prev = $snippetToInsert.first()[0].previousSibling;
                    var next = $snippetToInsert.last()[0].nextSibling;

                    if (prev) {
                        $snippetToInsert.detach();
                        // todo: handle history in jabberwock
                        $snippetToInsert.insertAfter(prev);
                    } else if (next) {
                        $snippetToInsert.detach();
                        // todo: handle history in jabberwock
                        $snippetToInsert.insertBefore(next);
                    } else {
                        var $parent = $snippetToInsert.parent();
                        $snippetToInsert.detach();
                        // todo: handle history in jabberwock
                        $parent.prepend($snippetToInsert);
                    }

                    _.defer(async () => {
                        self.trigger_up('snippet_dropped', {$target: $snippetToInsert});
                        const jwEditor = self.options.wysiwyg.editor;
                        const vNodes = await self.insertSnippet($snippetToInsert);
                        const layout = jwEditor.plugins.get(self.JWEditorLib.Layout);
                        const domLayout = layout.engines.dom;
                        const domNode = domLayout.getDomNodes(vNodes[0])[0];

                        await self._disableUndroppableSnippets();

                        await self._callForEachChildSnippet($(domNode), function (editor) {
                            return editor.buildSnippet();
                        });

                        $snippetToInsert.trigger('content_changed');
                        return self._updateInvisibleDOM();
                    });
                } else {
                    $snippetToInsert.remove();
                }
            },
        });
    },
    /**
     * Changes the content of the left panel and selects a tab.
     *
     * @private
     * @param {htmlString | Element | Text | Array | jQuery} [content]
     * the new content of the customizePanel
     * @param {this.tabs.VALUE} [tab='blocks'] - the tab to select
     */
    _updateLeftPanelContent: function ({content, tab}) {
        this._closeWidgets();

        tab = tab || this.tabs.BLOCKS;

        if (content) {
            while (this.customizePanel.firstChild) {
                this.customizePanel.removeChild(this.customizePanel.firstChild);
            }
            $(this.customizePanel).append(content);
        }

        this.$('#o_scroll').toggleClass('d-none', tab !== this.tabs.BLOCKS);
        this.customizePanel.classList.toggle('d-none', tab === this.tabs.BLOCKS);

        this.$('.o_we_add_snippet_btn').toggleClass('active', tab === this.tabs.BLOCKS);
        this.$('.o_we_customize_snippet_btn').toggleClass('active', tab === this.tabs.OPTIONS);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when a child editor asks for insertion zones to be enabled.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onActivateInsertionZones: function (ev) {
        this._activateInsertionZones(ev.data.$selectorSiblings, ev.data.$selectorChildren);
    },
    /**
     * Called when a child editor asks to deactivate the current snippet
     * overlay.
     *
     * @private
     */
    _onActivateSnippet: function (ev) {
        this._activateSnippet(ev.data.$element, ev.data.previewMode, ev.data.ifInactiveOptions);
    },
    /**
     * Called when a child editor asks to operate some operation on all child
     * snippet of a DOM element.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onCallForEachChildSnippet: function (ev) {
        this._callForEachChildSnippet(ev.data.$snippet, ev.data.callback);
    },
    /**
     * Called when the overlay dimensions/positions should be recomputed.
     *
     * @private
     */
    _onOverlaysCoverUpdate: function () {
        this.snippetEditors.forEach(editor => {
            editor.cover();
        });
    },
    /**
     * Called when a child editor asks to clone a snippet, allows to correctly
     * call the _onClone methods if the element's editor has one.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onCloneSnippet: async function (ev) {
        ev.stopPropagation();
        const editor = await this._getOrCreateSnippetEditor(ev.data.$snippet);
        await editor.clone();
        if (ev.data.onSuccess) {
            ev.data.onSuccess();
        }
    },
    /**
     * Called when a child editor asks to deactivate the current snippet
     * overlay.
     *
     * @private
     */
    _onDeactivateSnippet: function () {
        this._disableAllEditorsWithMutex();
    },
    /**
     * Called when a snippet has moved in the page.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onDragAndDropStop: async function (ev) {
        await this._destroyEditors();
        await this._activateSnippet(ev.data.$snippet);
    },
    /**
     * Called when a snippet editor asked to disable itself and to enable its
     * parent instead.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onGoToParent: function (ev) {
        ev.stopPropagation();
        this._activateSnippet(ev.data.$snippet.parent());
    },
    /**
     * @private
     */
    _onHideOverlay: function () {
        for (const editor of this.snippetEditors) {
            editor.toggleOverlay(false);
        }
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onInstallBtnClick: function (ev) {
        var self = this;
        var $snippet = $(ev.currentTarget).closest('[data-module-id]');
        var moduleID = $snippet.data('moduleId');
        var name = $snippet.attr('name');
        new Dialog(this, {
            title: _.str.sprintf(_t("Install %s"), name),
            size: 'medium',
            $content: $('<div/>', {text: _.str.sprintf(_t("Do you want to install the %s App?"), name)}).append(
                $('<a/>', {
                    target: '_blank',
                    href: '/web#id=' + moduleID + '&view_type=form&model=ir.module.module&action=base.open_module_tree',
                    text: _t("More info about this app."),
                    class: 'ml4',
                })
            ),
            buttons: [{
                text: _t("Save and Install"),
                classes: 'btn-primary',
                click: function () {
                    this.$footer.find('.btn').toggleClass('o_hidden');
                    this._rpc({
                        model: 'ir.module.module',
                        method: 'button_immediate_install',
                        args: [[moduleID]],
                    }).then(() => {
                        self.trigger_up('request_save', {
                            reloadEditor: true,
                            _toMutex: true,
                        });
                    }).guardedCatch(reason => {
                        reason.event.preventDefault();
                        this.close();
                        self.displayNotification({
                            title: _t("Something went wrong."),
                            message: _.str.sprintf(_t("The module <strong>%s</strong> could not be installed."), name),
                            type: 'danger',
                            sticky: true,
                        });
                    });
                },
            }, {
                text: _t("Install in progress"),
                icon: 'fa-spin fa-spinner fa-pulse mr8',
                classes: 'btn-primary disabled o_hidden',
            }, {
                text: _t("Cancel"),
                close: true,
            }],
        }).open();
    },
    /**
     * @private
     * @param {Event} ev
     */
    _onInvisibleEntryClick: async function (ev) {
        this._addTabLoading();

        ev.preventDefault();
        const $snippet = $(this.invisibleDOMMap.get(ev.currentTarget));
        const isVisible = await this._mutex.exec(async () => {
            const editor = await this._getOrCreateSnippetEditor($snippet);
            return editor.toggleTargetVisibility();
        });
        $(ev.currentTarget).find('.fa')
            .toggleClass('fa-eye', isVisible)
            .toggleClass('fa-eye-slash', !isVisible);
        if (isVisible) {
            return this._activateSnippet();
        } else {
            return this._disableAllEditors();
        }
    },
    /**
     * @private
     */
    _onBlocksTabClick: async function (ev) {
        await this._disableAllEditorsWithMutex();
        this._updateLeftPanelContent({
            content: [],
            tab: this.tabs.BLOCKS,
        });
    },
    /**
     * @private
     */
    _onDeleteBtnClick: function (ev) {
        const $snippet = $(ev.target).closest('.oe_snippet');
        new Dialog(this, {
            size: 'medium',
            title: _t('Confirmation'),
            $content: $('<div><p>' + _t(`Are you sure you want to delete the snippet: ${$snippet.attr('name')} ?`) + '</p></div>'),
            buttons: [{
                text: _t("Yes"),
                close: true,
                classes: 'btn-primary',
                click: async () => {
                    await this._rpc({
                        model: 'ir.ui.view',
                        method: 'delete_snippet',
                        kwargs: {
                            'view_id': parseInt(ev.currentTarget.dataset.snippetId),
                            'template_key': this.options.snippets,
                        },
                    });
                    await this._loadSnippetsTemplates(true);
                },
            }, {
                text: _t("No"),
                close: true,
            }],
        }).open();
    },
    /**
     * Prevents pointer-events to change the focus when a pointer slide from
     * left-panel to the editable area.
     *
     * @private
     */
    _onMouseDown: function () {
        const $blockedArea = $('#wrapwrap'); // TODO should get that element another way
        $blockedArea.addClass('o_we_no_pointer_events');
        const reenable = () => $blockedArea.removeClass('o_we_no_pointer_events');
        // Use a setTimeout fallback to avoid locking the editor if the mouseup
        // is fired over an element which stops propagation for example.
        const enableTimeoutID = setTimeout(() => reenable(), 5000);
        $(document).one('mouseup', () => {
            clearTimeout(enableTimeoutID);
            reenable();
        });
    },
    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onGetSnippetVersions: function (ev) {
        const snippet = this.el.querySelector(`.oe_snippet > [data-snippet="${ev.data.snippetName}"]`);
        ev.data.onSuccess(snippet && {
            vcss: snippet.dataset.vcss,
            vjs: snippet.dataset.vjs,
            vxml: snippet.dataset.vxml,
        });
    },
    /**
     * @private
     */
    _onReloadSnippetTemplate: async function (ev) {
        await this._disableAllEditorsWithMutex();
        await this._loadSnippetsTemplates(true);
    },
    /**
     * @private
     */
    _onBlockPreviewOverlays: function (ev) {
        this._blockPreviewOverlays = true;
    },
    /**
     * @private
     */
    _onUnblockPreviewOverlays: function (ev) {
        this._blockPreviewOverlays = false;
    },
    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onRemoveSnippet: async function (ev) {
        ev.stopPropagation();
        const editor = await this._getOrCreateSnippetEditor(ev.data.$snippet);
        await editor.removeSnippet();
        if (ev.data.onSuccess) {
            ev.data.onSuccess();
        }
    },
    /**
     * Saving will destroy all editors since they need to clean their DOM.
     * This has thus to be done when they are all finished doing their work.
     *
     * @private
     */
    _onSaveRequest: function (ev) {
        const data = ev.data;
        if (ev.target === this && !data._toMutex) {
            return;
        }
        delete data._toMutex;
        ev.stopPropagation();
        this._mutex.exec(() => {
            if (data.reloadEditor) {
                data.reload = false;
                const oldOnSuccess = data.onSuccess;
                data.onSuccess = async function () {
                    if (oldOnSuccess) {
                        await oldOnSuccess.call(this, ...arguments);
                    }
                    window.location.href = window.location.origin + window.location.pathname + '?enable_editor=1';
                };
            }
            this.trigger_up('request_save', data);
        });
    },
    /**
     * @private
     * @param {OdooEvent} ev
     * @param {Object} ev.data
     * @param {function} ev.data.exec
     */
    _onSnippetEditionRequest: function (ev) {
        this._mutex.exec(ev.data.exec);
    },
    /**
     * @private
     */
    _onSnippetCloned: function (ev) {
        this._updateInvisibleDOM();
    },
    /**
     * Called when a snippet is removed -> checks if there is draggable snippets
     * to enable/disable as the DOM changed.
     *
     * @private
     */
    _onSnippetRemoved: async function (ev) {
        await this._disableUndroppableSnippets();
        this._updateInvisibleDOM();
        ev.data.onFinish();
    },
    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onSnippetOptionVisibilityUpdate: async function (ev) {
        if (!ev.data.show) {
            this._disableAllEditorsWithMutex();
        }
        await this._updateInvisibleDOM(); // Re-render to update status
    },
    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onUpdateCustomizeElements: function (ev) {
        this._updateLeftPanelContent({
            content: ev.data.customize$Elements,
            tab: ev.data.customize$Elements.length ? this.tabs.OPTIONS : this.tabs.BLOCKS,
        });
    },
    /**
     * Called when an user value widget is being opened -> close all the other
     * user value widgets of all editors.
     */
    _onUserValueWidgetOpening: function () {
        this._closeWidgets();
    },

    /**
     * Retrieve a VRange from an element.
     *
     * The method to find the VNode is the following:
     * - a sibling after `element` is in vDocument
     * - a sibling before `element` is in vDocument
     * - an ancestor of `element` is in vDocument
     */
    _getVNodeRange(element) {
        const layout = this.options.wysiwyg.editor.plugins.get(this.JWEditorLib.Layout);
        const domLayout = layout.engines.dom;

        let currentNode = element.nextSibling;
        while (currentNode) {
            const nodes = domLayout.getNodes(currentNode);
            const node = nodes && nodes[0];
            if (node) {
                return this.JWEditorLib.VRange.at(node, 'BEFORE')[0];
            }
            currentNode = currentNode.nextSibling;
        }
        currentNode = element.previousSibling;
        while (currentNode) {
            const nodes = domLayout.getNodes(currentNode);
            const node = nodes && nodes[0];
            if (node) {
                return this.JWEditorLib.VRange.at(node, 'AFTER')[0];
    }
            currentNode = currentNode.previousSibling;
        }
        currentNode = element.parentElement;
        while (currentNode) {
            const nodes = domLayout.getNodes(currentNode);
            const node = nodes && nodes[0];
            if (node) {
                return this.JWEditorLib.VRange.at(node, 'INSIDE')[0];
    }
            currentNode = currentNode.parentElement;
        }
    },

    insertSnippet: async function ($snippet) {
        const rangePoint = this._getVNodeRange($snippet[0]);
        const result = await this.options.wysiwyg.editor.execCommand('insertHtml', {
            html: $snippet[0].outerHTML,
            rangePoint: rangePoint,
        });
        return result;
    }
});

return {
    SnippetsMenu: SnippetsMenu,
    globalSelector: globalSelector,
};
});
