odoo.define('web_studio.FormEditor', function (require) {
"use strict";

var core = require('web.core');
var FormRenderer = require('web.FormRenderer');

var EditorMixin = require('web_studio.EditorMixin');
var FieldSelectorDialog = require('web_studio.FieldSelectorDialog');
var FormEditorHook = require('web_studio.FormEditorHook');
var pyUtils = require('web.py_utils');

var _t = core._t;

const components = {
    ChatterContainer: require('mail/static/src/components/chatter_container/chatter_container.js'),
};
const { ComponentWrapper } = require('web.OwlCompatibility');

// FIXME AAB: disable this require until we have mail_enterprise
// ensure `.include()` on `mail_enterprise` is applied before `web_studio`
// require('mail_enterprise/static/src/widgets/form_renderer/form_renderer.js');

class ChatterContainerWrapperComponent extends ComponentWrapper {}

var FormEditor =  FormRenderer.extend(EditorMixin, {
    nearest_hook_tolerance: 50,
    className: FormRenderer.prototype.className + ' o_web_studio_form_view_editor',
    events: _.extend({}, FormRenderer.prototype.events, {
        'click .o_web_studio_add_chatter': '_onAddChatter',
    }),
    custom_events: _.extend({}, FormRenderer.prototype.custom_events, {
        'on_hook_selected': '_onSelectedHook',
    }),
    /**
     * @constructor
     * @param {Object} params
     * @param {Boolean} params.show_invisible
     * @param {Boolean} params.chatter_allowed
     */
    init: function (parent, state, params) {
        this._super.apply(this, arguments);
        this.show_invisible = params.show_invisible;
        this.renderInvisible = this.show_invisible;
        this.chatter_allowed = params.chatter_allowed;
        this._chatterNode = undefined;
        this._chatterContainerOverview = undefined;
        this.silent = false;
        this.node_id = 1;
        this.hook_nodes = {};
    },
    /**
     * @override
     */
    destroy() {
        this._super(...arguments);
        this._chatterContainerOverview = undefined;
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    getLocalState: function () {
        var state = this._super.apply(this, arguments) || {};
        if (this.selected_node_id) {
            state.selected_node_id = this.selected_node_id;
        }
        return state;
    },
    /**
     * @override
     */
    highlightNearestHook: function ($helper, position) {
        var self = this;
        EditorMixin.highlightNearestHook.apply(this, arguments);

        var $nearest_form_hooks = this.$('.o_web_studio_hook')
            .touching({
                    x: position.pageX - this.nearest_hook_tolerance,
                    y: position.pageY - this.nearest_hook_tolerance,
                    w: this.nearest_hook_tolerance*2,
                    h: this.nearest_hook_tolerance*2
                },{
                    container: document.body
                }
            ).nearest({x: position.pageX, y: position.pageY}, {container: document.body});

        var is_nearest_hook = false;
        $nearest_form_hooks.each(function () {
            var hook_id = $(this).data('hook_id');
            var hook = self.hook_nodes[hook_id];
            if ($helper.data('structure') === 'notebook') {
                // a notebook cannot be placed inside a page or in a group
                if (hook.type !== 'page' && !$(this).parents('.o_group').length) {
                    is_nearest_hook = true;
                }
            } else if ($helper.data('structure') === 'group') {
                // a group cannot be placed inside a group
                if (hook.type !== 'insideGroup' && !$(this).parents('.o_group').length) {
                    is_nearest_hook = true;
                }
            } else {
                is_nearest_hook = true;
            }

            // Prevent drops outside of groups if not in whitelist
            var whitelist = ['o_web_studio_field_picture', 'o_web_studio_field_html',
                'o_web_studio_field_many2many', 'o_web_studio_field_one2many',
                'o_web_studio_field_tabs', 'o_web_studio_field_columns'];
            var hookTypeBlacklist = ['genericTag', 'afterGroup', 'afterNotebook', 'insideSheet'];
            var fieldClasses = $helper[0].className.split(' ');
            if (_.intersection(fieldClasses, whitelist).length === 0 && hookTypeBlacklist.indexOf(hook.type) > -1) {
                is_nearest_hook = false;
            }

            if (is_nearest_hook) {
                $(this).addClass('o_web_studio_nearest_hook');
                return false;
            }
        });

        return is_nearest_hook;
    },
    /**
     * @override
     */
    setLocalState: function (state) {
        this.silent = true;
        this._super.apply(this, arguments);
        this.silent = false;
        this.unselectedElements();
        if (state.selected_node_id) {
            var $selected_node = this.$('[data-node-id="' + state.selected_node_id + '"]');
            if ($selected_node) {
                $selected_node.click();
            }
        }
    },
    /**
     * Selects the field on view
     *
     * @param {string} fieldName
     */
    selectField: function (fieldName) {
        this.$('[name=' + fieldName + ']').click();
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Add Studio handler for button clicks; will parse the `effect` attribute
     * on the node to pre-populate the 'rainbow man' section with the current
     * settings for the button as well as the generic node clicked handler that
     * enable edition of the node in the sidebar.
     * @private
     * @param {Object} node
     * @param {jQueryElement} $button
     */
    _addButtonHandler: function (node, $button) {
        this.setSelectable($button);
        const nodeID = this.node_id++;
        $button.attr('data-node-id', nodeID);
        if (node.attrs.effect) {
            node.attrs.effect = _.defaults(pyUtils.py_eval(node.attrs.effect), {
                fadeout: 'medium'
            });
        }
        $button.click((event) => {
            event.preventDefault();
            event.stopPropagation();
            this.selected_node_id = nodeID;
            this.trigger_up('node_clicked', {node: node});
        });
        return $button;
    },
    
    /**
     * @override
     * @private
     */
    _applyModifiers: function (modifiersData, record, element) {
        var def = this._super.apply(this, arguments);

        if (this.show_invisible) {
            var elements = element ? [element] : modifiersData.elements;
            _.each(elements, function (element) {
                if (element.$el.hasClass('o_invisible_modifier')) {
                    element.$el
                        .removeClass('o_invisible_modifier')
                        .addClass('o_web_studio_show_invisible');
                }
            });
        }

        return def;
    },
    /**
     * @private
     * @param {MouseEvent} ev
     * @param {Object} ui
     */
    _handleDrop: function (ev, ui) {
        var $hook = this.$('.o_web_studio_nearest_hook');
        if ($hook.length) {
            var hook_id = $hook.data('hook_id');
            var hook = this.hook_nodes[hook_id];
            // draggable is only set on `droppable` elements, not `draggable`
            var $drag = ui.draggable || $(ev.target);
            this.handleDrop($drag, hook.node, hook.position);
            ui.helper.removeClass('ui-draggable-helper-ready');
            $hook.removeClass('o_web_studio_nearest_hook');
        }
    },
    /**
     * @override
     * @private
     */
    _postProcessField: function (widget, node) {
        this._super.apply(this, arguments);
        // make empty widgets appear if there is no label
        if (!widget.isSet() && (!node.has_label || node.attrs.nolabel)) {
            widget.$el.removeClass('o_field_empty').addClass('o_web_studio_widget_empty');
            // statusbar needs to be rendered normally
            if (node.attrs.widget !== 'statusbar') {
                widget.$el.text(widget.string);
            }
        }
        // remove all events on the widget as we only want to click for edition
        widget.$el.off();
        this._processField(node, widget.$el);
    },
    /**
     * Process a field node, in particular, bind an click handler on $el to edit
     * its field attributes.
     *
     * @private
     * @param {Object} node
     * @param {JQuery} $el
     */
    _processField: function (node, $el) {
        var self = this;
        // detect presence of mail fields
        if (node.attrs.name === "message_ids") {
            this.has_message_field = true;
        } else if (node.attrs.name === "message_follower_ids") {
            this.has_follower_field = true;
        } else if (node.attrs.name === "activity_ids") {
            this.has_activity_field = true;
        } else {
            var modifiers = self._getEvaluatedModifiers(node, this.state);
            if (modifiers.invisible && !this.show_invisible) {
                return;
            }
            $el.attr('data-node-id', this.node_id++);
            this.setSelectable($el);
            $el.click(function (event) {
                event.preventDefault();
                event.stopPropagation();
                self.selected_node_id = $el.data('node-id');
                self.trigger_up('node_clicked', {node: node, $node:$el});
            });
        }
    },
    /**
     * @override
     * @private
     */
    _render: function () {
        var self = this;
        this.has_follower_field = false;
        this.has_message_field = false;
        this.has_activity_field = false;

        this.$el.droppable({
            accept: ".o_web_studio_component",
            drop: this._handleDrop.bind(this),
        });

        return this._super.apply(this, arguments).then(async function () {
            // Add chatter hook + chatter preview
            if (!self._hasChatter() && self.chatter_allowed) {
                var $chatter_hook = $('<div>').addClass('o_web_studio_add_chatter o_chatter');
                // Append non-hover content
                $chatter_hook.append($('<span>', {class: 'container'})
                    .append($('<span>', {
                        text: _t('Add Chatter Widget'),
                    }).prepend($('<i>', {
                        class: 'fa fa-comments',
                        style: 'margin-right:10px',
                    })))
                );
                const $studioChatterContainer = $('<div>').addClass('o_Studio_ChatterContainer');
                $chatter_hook.append($studioChatterContainer);
                // Append hover content (chatter preview)
                if (!self._chatterContainerOverview) {
                    self._chatterContainerOverview = new ChatterContainerWrapperComponent(
                        self,
                        components.ChatterContainer,
                        {
                            threadModel: self.state.model,
                        },
                    );
                }
                await self._chatterContainerOverview.mount($studioChatterContainer[0]);
                $chatter_hook.insertAfter(self.$('.o_form_sheet'));
            }
            // Add buttonbox hook
            if (!self.$('.oe_button_box').length) {
                var $buttonbox_hook = $('<button>')
                    .addClass('btn oe_stat_button o_web_studio_button_hook')
                    .click(function (event) {
                        event.preventDefault();
                        self.trigger_up('view_change', {
                            type: 'add',
                            add_buttonbox: true,
                            structure: 'button',
                        });
                    });
                var $buttonbox = $('<div>')
                    .addClass('oe_button_box')
                    .append($buttonbox_hook);
                self.$('.o_form_sheet').prepend($buttonbox);
            }
            // Add statusbar
            if (!self.$('.o_statusbar_status').length) {
                var $statusbar = $('<div>', {
                    text: _t("Add a pipeline status bar"),
                    class: 'o_web_studio_statusbar_hook',
                }).click(function () {
                    var values = {
                        add_statusbar: !self.$('.o_form_statusbar').length,
                        type: 'add',
                        structure: 'field',
                        field_description: {
                            field_description: "Pipeline status bar",
                            type: 'selection',
                            selection: [
                                ['status1', _t('First Status')],
                                ['status2', _t('Second Status')],
                                ['status3', _t('Third Status')],
                            ],
                            default_value: true,
                        },
                        target: {
                            tag: 'header',
                        },
                        new_attrs: {
                            widget: 'statusbar',
                            options: "{'clickable': '1'}",
                        },
                        position: 'inside',
                    };
                    self.trigger_up('view_change', values);
                });
                self.$('.o_form_sheet_bg').prepend($statusbar);
            }
            // Add avtar
            if (self.$('.oe_title').length & !self.$('.oe_title').siblings('.oe_avatar').length && !self.$('.oe_title > h1 > .oe_avatar').length) {
                const $avatar = $('<div>', {
                    text: _t("Add Picture"),
                    class: self.$('.oe_title > h1.d-flex.flex-row').length ? 'oe_avatar ml-3 p-3 o_web_studio_avatar h4': 'oe_avatar ml-3 mr-3 o_web_studio_avatar',
                }).click(function () {
                    const compatibleFields = _.pick(self.state.fields, function (e) {
                        return e.type === 'binary';
                    });
                    const dialog = new FieldSelectorDialog(self, compatibleFields, true).open();
                    dialog.on('confirm', self, function (field) {
                        self.trigger_up('view_change', {
                            structure: 'avatar_image',
                            field: field,
                        });
                    });
                });
                if (self.$('h1').hasClass('d-flex flex-row')) {
                    self.$('.oe_title > h1').append($avatar);
                } else {
                    self.$('.oe_title').before($avatar);
                }
            }
            // Apply 'text-muted' class on optional field dropdown
            self.$('i.o_optional_columns_dropdown_toggle')
                .addClass('text-muted')
        });
    },
    /**
     * @private
     * @returns {JQuery}
     */
    _renderAddingContentLine: function (node) {
        var formEditorHook = this._renderHook(node, 'after', 'tr');
         // start the widget
        return formEditorHook.appendTo($('<div>')).then(function() {
            return formEditorHook.$el;
        })
    },
    /**
     * @override
     * @private
     */
    _renderButtonBox: function () {
        var self = this;
        var $buttonbox = this._super.apply(this, arguments);
        var $buttonhook = $('<button>').addClass('btn oe_stat_button o_web_studio_button_hook');
        $buttonhook.click(function (event) {
            event.preventDefault();

            self.trigger_up('view_change', {
                type: 'add',
                structure: 'button',
            });
        });

        $buttonhook.prependTo($buttonbox);
        return $buttonbox;
    },
    /**
     * @override
     * @private
     */
    _renderGenericTag: function (node) {
        var $result = this._super.apply(this, arguments);
        if (node.attrs.class === 'oe_title') {
            var formEditorHook = this._renderHook(node, 'after', '', 'genericTag')
            this.defs.push(formEditorHook.appendTo($result));
        }
        return $result;
    },
    /**
     * @override
     * @private
     * @param {Object} node
     * @returns {jQueryElement}
     */
    _renderHeaderButton: function (node) {
        var self = this;
        var $button = this._super.apply(this, arguments);
        $button = this._addButtonHandler(node, $button);
        return $button;
    },
    /**
     * @override
     * @private
     *
     * FIXME wrong, studio has never been able to handle groups will col > 2...
     *
     */
    _renderInnerGroup: function (node) {
        var self = this;
        var formEditorHook;
        var $result = this._super.apply(this, arguments);
        _.each(node.children, function (child) {
            if (child.tag === 'field') {
                Promise.all(self.defs).then(function () {
                    var $widget = $result.find('[name="' + child.attrs.name + '"]');
                    var $tr = $widget.closest('tr');
                    if (!$widget.is('.o_invisible_modifier')) {
                        self._renderAddingContentLine(child).then(function(element) {
                            element.insertAfter($tr);
                            // apply to the entire <tr> o_web_studio_show_invisible
                            // rather then inner label/input
                            if ($widget.hasClass('o_web_studio_show_invisible')) {
                                $widget.removeClass('o_web_studio_show_invisible');
                                $tr.find('label[for="' + $widget.attr('id') + '"]').removeClass('o_web_studio_show_invisible');
                                $tr.addClass('o_web_studio_show_invisible');
                            }
                        });
                    }
                    if (child.has_label) {
                        // as it's not possible to move the label, we only allow to
                        // move fields with a default label (otherwise the field
                        // will be moved but the label will stay)
                        self._setDraggable(child, $tr);
                    }
                    self._processField(child, $tr);
                });
            }
        });
        const modifiers = this._getEvaluatedModifiers(node, this.state);
        if (!modifiers.invisible || this.show_invisible) {
            // Add click event to see group properties in sidebar
            $result.attr('data-node-id', this.node_id++);
            this.setSelectable($result);
            $result.click(function (event) {
                event.stopPropagation();
                self.selected_node_id = $result.data('node-id');
                self.trigger_up('node_clicked', { node: node });
            });
        }
        // Add hook for groups that have not yet content.
        if (!node.children.length) {
            formEditorHook = this._renderHook(node, 'inside', 'tr', 'insideGroup');
            this.defs.push(formEditorHook.appendTo($result));
        } else {
            // Add hook before the first node in a group.
            var $firstRow = $result.find('tr:first');
            formEditorHook = this._renderHook(node.children[0], 'before', 'tr');
            if (node.attrs.string) {
                // the group string is displayed in a tr
                this.defs.push(formEditorHook.insertAfter($firstRow));
            } else {
                this.defs.push(formEditorHook.insertBefore($firstRow));
            }
        }
        return $result;
    },

    /**
     * @override
     * @private
     */
    _renderInnerGroupField: function (node) {
        node.has_label = (node.attrs.nolabel !== "1");
        return this._super.apply(this, arguments);
    },
    /**
     * @override
     * @private
     */
    _renderNode: function (node) {
        var $el = this._super.apply(this, arguments);
        if (node.tag === 'div' && node.attrs.class === 'oe_chatter') {
            this._chatterNode = node;
        }
        return $el;
    },
    /**
     * @override
     * @private
     */
    _renderStatButton: function (node) {
        var self = this;
        var $button = this._super.apply(this, arguments);
        $button.attr('data-node-id', this.node_id++);
        this.setSelectable($button);
        $button.click(function (ev) {
            if (! $(ev.target).closest('.o_field_widget').length) {
                // click on the button and not on the field inside this button
                self.selected_node_id = $button.data('node-id');
                self.trigger_up('node_clicked', {node: node});
            }
        });
        return $button;
    },
    /**
     * @override
     * @private
     */
    _renderTabPage: function (node) {
        var $result = this._super.apply(this, arguments);
        // Add hook only for pages that have not yet outergroups.
        if (!$result.children('.o_group:not(.o_inner_group):last-child').length) {
            var formEditorHook = this._renderHook(node, 'inside', 'div', 'page');
            this.defs.push(formEditorHook.appendTo($result));
        }
        return $result;
    },
    /**
     * @override
     * @private
     */
    _renderOuterGroup: function (node) {
        var $result = this._super.apply(this, arguments);

        // Add hook after this group
        var formEditorHook = this._renderHook(node, 'after', '', 'afterGroup');
        this.defs.push(formEditorHook.insertAfter($result));
        return $result;
    },

    /**
     * @override
     * @private
     */
    _renderTagButton: function (node) {
        let $result = this._super.apply(this, arguments);
        $result = this._addButtonHandler(node, $result);
        return $result;
    },

    /**
     * @override
     * @private
     */
    _renderTagLabel: function (node) {
        var self = this;
        var $result = this._super.apply(this, arguments);

        // only handle label tags, not labels associated to fields (already
        // handled in @_renderInnerGroup with @_processField)
        if (node.tag === 'label') {
            $result.attr('data-node-id', this.node_id++);
            this.setSelectable($result);
            $result.click(function (event) {
                event.preventDefault();
                event.stopPropagation();
                self.selected_node_id = $result.data('node-id');
                self.trigger_up('node_clicked', {node: node});
            });
        }
        return $result;
    },
    /**
     * @override
     * @private
     */
    _renderTagNotebook: function (node) {
        var self = this;
        var $result = this._super.apply(this, arguments);

        var $addTag = $('<li>', {class: 'nav-item'}).append('<a href="#" class="nav-link"><i class="fa fa-plus-square"/></a>');
        $addTag.click(function (event) {
            event.preventDefault();
            event.stopPropagation();
            self.trigger_up('view_change', {
                type: 'add',
                structure: 'page',
                position: 'inside',
                node: node,
            });
        });
        $result.find('ul.nav-tabs').append($addTag);

        var formEditorHook = this._renderHook(node, 'after', '', 'afterNotebook');
        this.defs.push(formEditorHook.appendTo($result));

        // add node-id data on all tabs once whole notebook tabs are rendered
        // as registerModifiers of all tabs are called from _renderTagNotebook
        // so we need to evaluate modifiers here else we will not get modifiers
        Object.entries(node.children).forEach(([index, child]) => {
            const modifiers = this._getEvaluatedModifiers(child, this.state);
            if (!modifiers.invisible || this.show_invisible) {
                const $page = $result.find(`.nav-item:eq(${index})`);
                $page.attr('data-node-id', this.node_id++);
                this.setSelectable($page);
                $page.click(function (event) {
                    event.preventDefault();
                    if (!self.silent) {
                        self.selected_node_id = $page.data('node-id');
                        self.trigger_up('node_clicked', { node: child });
                    }
                });
            }
        });
        return $result;
    },
    /**
     * @override
     * @private
     */
    _renderTagSheet: function (node) {
        var $result = this._super.apply(this, arguments);
        var formEditorHook = this._renderHook(node, 'inside', '', 'insideSheet');
        this.defs.push(formEditorHook.prependTo($result));
        return $result;
    },
    /**
     * @override
     * @private
     */
    async _renderView() {
        await this._super(...arguments);
        if (this._hasChatter()) {
            const $el = $(this._chatterContainerComponent.el);
            this.setSelectable($el);
            // Put a div in overlay preventing all clicks chatter's elements
            $el.append($('<div>', { 'class': 'o_web_studio_overlay' }));
            $el.attr('data-node-id', this.node_id++);
            $el.click(() => {
                this.selected_node_id = $el.data('node-id');
                this.trigger_up('node_clicked', { node: this._chatterNode });
            });
        }
    },
    /**
     * @private
     * @param {Object} node
     * @param {String} position
     * @param {String} tagName
     * @param {String} type
     * @returns {Widget} FormEditorHook
     */
    _renderHook: function (node, position, tagName, type) {
        var hook_id = _.uniqueId();
        this.hook_nodes[hook_id] = {
            node: node,
            position: position,
            type: type,
        };
        return new FormEditorHook(this, position, hook_id, tagName);
    },
    /**
     * Set a jQuery element as draggable.
     * Note that we only set fields as draggable for now.
     *
     * @param {Object} node
     * @param {jQuery} $el
     */
    _setDraggable: function (node, $el) {
        var self = this;

        if ($el.is('tr')) {
            // *** HACK ***
            // jQuery.ui draggable cannot be set on a <tr> in Chrome because
            // position: relative has just no effect on a <tr> so we keep the
            // first <td> instead
            $el = $el.find('td:first');
        }

        $el.draggable({
            revertDuration: 200,
            refreshPositions: true,
            start: function (e, ui) {
                self.$('.o_web_studio_hovered').removeClass('o_web_studio_hovered');
                self.$('.o_web_studio_clicked').removeClass('o_web_studio_clicked');
                ui.helper.addClass('ui-draggable-helper');
                ui.helper.data('name', node.attrs.name);
            },
            revert: function () {
                // a field cannot be dropped on the same place
                var $hook = self.$('.o_web_studio_nearest_hook');
                if ($hook.length) {
                    var hook_id = $hook.data('hook_id');
                    var hook = self.hook_nodes[hook_id];
                    if (hook.node.attrs.name !== node.attrs.name) {
                        return false;
                    }
                }
                self.$('.ui-draggable-helper').removeClass('ui-draggable-helper');
                self.$('.ui-draggable-helper-ready').removeClass('ui-draggable-helper-ready');
                return true;
            },
            stop: this._handleDrop.bind(this),
        });

        // display nearest hook (handled by the ViewEditorManager)
        $el.on('drag', _.throttle(function (event, ui) {
            self.trigger_up('drag_component', {
                position: {pageX: event.pageX, pageY: event.pageY},
                $helper: ui.helper,
            });
        }, 200));
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onAddChatter: function (ev) {
        // prevent multiple click
        $(ev.currentTarget).css('pointer-events', 'none');
        this.trigger_up('view_change', {
            structure: 'chatter',
            remove_follower_ids: this.has_follower_field,
            remove_message_ids: this.has_message_field,
            remove_activity_ids: this.has_activity_field,
        });
    },
    /**
     * @private
     */
    _onButtonBoxHook: function () {
        this.trigger_up('view_change', {
            structure: 'buttonbox',
        });
    },
    /**
     * @private
     */
    _onSelectedHook: function () {
        this.selected_node_id = false;
    },
});

return FormEditor;

});
