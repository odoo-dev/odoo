odoo.define('web_studio.reportNewComponents', function (require) {
"use strict";

var config = require('web.config');
var core = require('web.core');
var Dialog = require('web.Dialog');
var weWidgets = require('wysiwyg.widgets');

var Abstract = require('web_studio.AbstractReportComponent');
var NewFieldDialog = require('web_studio.NewFieldDialog');

var _t = core._t;
var _lt = core._lt;

var AbstractNewBuildingBlock = Abstract.extend({
    type: false,
    structure: false,
    label: false,
    fa: false,
    description: false,
    addEmptyRowsTargets: true,
    events: _.extend({}, Abstract.prototype.events, {
        mouseenter: '_onHover',
        focusin: '_onHover',
        mouseleave: '_onStopHover',
        focusout: '_onStopHover',
    }),
    /**
     * @override
     */
    start: function () {
        var self = this;
        this.$el.addClass('o_web_studio_component');
        this.$el.text(this.label);
        if (this.fa) {
            this.$el.append('<i class="fa ' + this.fa + '">');
        }
        if (config.isDebug() && this.description) {
            this.$el.addClass('o_web_studio_debug');
            this.$el.append($('<div>')
                .addClass('o_web_studio_component_description')
                .text(this.description)
            );
        }
        var dragFunction = _.cancellableThrottleRemoveMeSoon(function (e) {
                self.trigger_up('drag_component', {
                    position: { pageX: e.pageX, pageY: e.pageY },
                    widget: self,
                });
            }, 100);
        this.$el.draggable({
            helper: 'clone',
            opacity: 0.4,
            scroll: false,
            // revert: 'invalid',  // this causes _setTimeout in tests for stop
            revertDuration: 200,
            refreshPositions: true,
            iframeFix: true,
            start: function (e, ui) {
                $(ui.helper).addClass("ui-draggable-helper");
                self.trigger_up('begin_drag_component', {
                    widget: self
                });
            },
            drag: dragFunction,
            stop: function (e) {
                dragFunction.cancel();
                self.trigger_up('drop_component', {
                    position: { pageX: e.pageX, pageY: e.pageY },
                    widget: self,
                });
            }
        });

        return this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * To be overriden.
     *
     * @param {Object} options
     * @param {Object[]} options.targets
     * @param {Integer} [options.oeIndex]
     * @returns {Promise<Object>}
     */
    add: function (options) {
        this.targets = options.targets;
        var first = options.targets[0];
        this.index = first.data.oeIndex;
        this.position = first.data.oePosition;
        this.node = first.node;
        return Promise.resolve({
            type: this.type,
            options: {
                columns: this.dropColumns,
                index: first.data.oeIndex,
            },
        });
    },
    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------
    /**
     * @private
     * @param {MouseEvent} e
     */
    _onHover: function (e) {
        this.trigger_up('begin_preview_drag_component', {
            widget: this,
        });
    },

    /**
     * @private
     * @param {MouseEvent} e
     */
    _onStopHover: function (e) {
        this.trigger_up('end_preview_drag_component', {
            widget: this,
        });
    },
    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------
    /**
     * create td and th in table, manage colspan.
     *
     * @param {Object} options
     * @param {string} options.head
     * @param {string} options.headLoop
     * @param {string} options.body
     * @param {string} options.bodyLoop
     * @param {string} options.foot
     * @param {string} options.footLoop
     * @returns {Object}
     */
    _createReportTableColumn: function (options) {
        var self = this;
        var inheritance = [];
        var updatedNodes = [];

        // add cells in rows

        _.each(this.targets, function (target) {
            var node = target.node;
            var inheritanceItem;
            if (node.tag === 'th' || node.tag === 'td') {
                var loop = self._findParentWithTForeach(node) ? true : false;
                var dataName = loop ? 'Loop' : '';
                var content = '<' + node.tag + '>';
                if (node.tag === 'th' || node.parent.parent.tag === 'thead') {
                    content += options['head' + dataName] || options.head || '';
                } else if (node.parent.parent.tag === 'tfoot') {
                    content += options['foot' + dataName] || options.foot || '';
                } else {
                    content += options['body' + dataName] || options.body || '';
                }
                content += '</' + node.tag + '>';

                updatedNodes.push(node);
                inheritanceItem = {
                    content: content,
                    position: target.position,
                    xpath: node.attrs['data-oe-xpath'],
                    view_id: +node.attrs['data-oe-id'],
                };
            } else if (node.tag === 'tr') {
                updatedNodes.push(node);
                inheritanceItem = {
                    content: '<td>' + (options.tbody || '') + '</td>',
                    position: target.position,
                    xpath: node.attrs['data-oe-xpath'],
                    view_id: +node.attrs['data-oe-id'],
                };
            }
            inheritance.push(inheritanceItem);
        });

        // colspan
        var cellsToGrow = [];
        _.each(this.targets, function (target) {
            var node = target.node;
            if (target.position !== 'after') {
                return;
            }

            // define td index

            var nodeIndex = 0;
            var nodeRow = self._getParentNode(node, function (node) { return node.tag === 'tr'; });
            var cells = self._getChildrenNode(nodeRow, function (node) { return node.tag === 'td' || node.tag === 'th'; });
            for (var k = 0; k < cells.length; k++) {
                nodeIndex += +(cells[k].attrs.colspan || 1);
                if (cells[k] === node) {
                    break;
                }
            }

            // select colspan to grow

            var table = self._getParentNode(node, function (node) { return node.tag === 'table'; });
            var rows = self._getChildrenNode(table, function (node) { return node.tag === 'tr'; });
            _.each(rows, function (row) {
                if (row === nodeRow) {
                    return;
                }

                var cells = self._getChildrenNode(row, function (node) { return node.tag === 'td' || node.tag === 'th'; });

                var cellIndex = 0;
                for (var k = 0; k < cells.length; k++) {
                    var cell = cells[k];
                    cellIndex += +(cell.attrs.colspan || 1);
                    if (cellIndex >= nodeIndex) {
                        if (((+cell.attrs.colspan) > 1) && cellsToGrow.indexOf(cell) === -1) {
                            cellsToGrow.push(cell);
                        }
                        break;
                    }
                }
            });
        });
        _.each(cellsToGrow, function (node) {
            inheritance.push({
                content: '<attribute name="colspan">' + ((+node.attrs.colspan) + 1) + '</attribute>',
                position: 'attributes',
                xpath: node.attrs['data-oe-xpath'],
                view_id: +node.attrs['data-oe-id'],
            });
        });

        return inheritance;
    },
    _createStructure: function (options) {
        var xml = ['<div class="row'];
        if (this.structureClass) {
            xml.push(' ' + this.structureClass);
        }
        xml.push('">');
        for (var k = 0; k < this.dropColumns.length; k++) {
            var column = this.dropColumns[k];
            xml.push('<div class="col-');
            xml.push(column[1]);
            if (column[0]) {
                xml.push(' offset-');
                xml.push(column[0]);
            }
            xml.push('">');
            if (options.content && (k === options.index || options.fillStructure)) {
                xml.push(options.content);
            }
            xml.push('</div>');
        }
        xml.push('</div>');

        return [{
            content: xml.join(''),
            position: this.position,
            xpath: this.node.attrs['data-oe-xpath'],
            view_id: +this.node.attrs['data-oe-id'],
        }];
    },
    _createContent: function (options) {
        if (this.dropColumns && typeof this.index === 'number') {
            return this._createStructure({
                index: this.index,
                content: options.contentInStructure || options.content,
                fillStructure: options.fillStructure || false,
            });
        } else {
            return _.map(this.targets, function (target) {
                var isCol = (target.node.attrs.class || '').match(/(^|\s)(col(-[0-9]+)?)(\s|$)/);
                return {
                    content: isCol ? options.contentInStructure || options.content : options.content,
                    position: target.position,
                    xpath: target.node.attrs['data-oe-xpath'],
                    view_id: +target.node.attrs['data-oe-id'],
                };
            });
        }
    },
    _getParentNode: function (node, fn) {
        while (node) {
            if (fn(node)) {
                return node;
            }
            node = node.parent;
        }
    },
    /**
     * TODO: rewrite this function
     */
    _getChildrenNode: function (parent, fn) {
        var children = [];
        var stack = [parent];
        parent = stack.shift();
        while (parent) {
            if (parent.children) {
                for (var k = 0; k < parent.children.length; k++) {
                    var node = parent.children[k];
                    if (fn(node)) {
                        children.push(node);
                    }
                }
                stack = parent.children.concat(stack);
            }
            parent = stack.shift();
        }
        return children;
    },
    /**
     * Goes through the hierachy of parents of the node in parameter until we
     * find the closest parent with a t-foreach defined on it.
     *
     * @private
     * @param {Object} node
     * @returns {Object|undefined} node that contains a t-foreach as parent of the node in parameter
     */
    _findParentWithTForeach: function (node) {
        if (!node || !node.parent || (node.tag === "div" && node.attrs.class === "page")) {
            return;
        }
        if (node.attrs["t-foreach"]) {
            return node;
        }
        return this._findParentWithTForeach(node.parent);
    },
});
var TextSelectorTags = 'span, p, h1, h2, h3, h4, h5, h6, blockquote, pre, small, u, i, b, font, strong, ul, li, dl, dt, ol, .page > .row > div:empty';
var filter = ':not([t-field]):not(:has(t, [t-' + QWeb2.ACTIONS_PRECEDENCE.join('], [t-') + ']))';

// ----------- TEXT -----------

var BlockText = AbstractNewBuildingBlock.extend({
    type: 'text',
    label: _lt('Text'),
    dropIn: '.page',
    className: 'o_web_studio_field_char',
    hookClass: 'o_web_studio_block_char',
    add: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            return Promise.resolve({
                inheritance: self._createContent({
                    content: '<div class="row"><div class="col"><span>New Text Block</span></div></div>',
                })
            });
        });
    },
});

var InlineText = AbstractNewBuildingBlock.extend({
    type: 'text',
    label: _lt('Text'),
    className: 'o_web_studio_field_char',
    hookClass: 'o_web_studio_hook_inline',
    hookAutoHeight: true,
    dropIn: TextSelectorTags.split(',').join(filter + '|') + filter,
    selectorSeparator: '|',
    hookTag: 'span',
    add: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            return Promise.resolve({
                inheritance: self._createContent({
                    content: '<span>New Text Block</span>',
                })
            });
        });
    },
});

var ColumnHalfText = AbstractNewBuildingBlock.extend({
    type: 'text',
    label: _lt('Two Columns'),
    dropIn: '.page',
    className: 'o_web_studio_field_fa',
    fa: 'fa-align-left',
    hookClass: 'o_web_studio_block_char',
    hookTag: 'div',
    dropColumns: [[0, 6], [0, 6]],
    addEmptyRowsTargets: false,
    add: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            return Promise.resolve({
                inheritance: self._createContent({
                    fillStructure: true,
                    contentInStructure: '<span>New Column</span>',
                })
            });
        });
    },
});

var ColumnThirdText = AbstractNewBuildingBlock.extend({
    type: 'text',
    label: _lt('Three Columns'),
    dropIn: '.page',
    className: 'o_web_studio_field_fa',
    fa: 'fa-align-left',
    hookClass: 'o_web_studio_block_char',
    hookTag: 'div',
    dropColumns: [[0, 4], [0, 4], [0, 4]],
    addEmptyRowsTargets: false,
    add: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            return Promise.resolve({
                inheritance: self._createContent({
                    fillStructure: true,
                    contentInStructure: '<span>New Column</span>',
                })
            });
        });
    },
});

var TableCellText = AbstractNewBuildingBlock.extend({
    type: 'text',
    label: _lt('Text in Cell'),
    className: 'o_web_studio_field_char',
    hookAutoHeight: false,
    hookClass: 'o_web_studio_hook_inline',
    dropIn: 'td, th',
    hookTag: 'span',
    add: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            return Promise.resolve({
                inheritance: self._createContent({
                    content: '<span>New Text Block</span>',
                })
            });
        });
    },
});


// ----------- FIELD -----------
/**
 * Defines the behavior of a field building block. It behaves by default by asking
 * the user to select a field in a model, and takes the first target as
 * destination node
 */
var AbstractFieldBlock = AbstractNewBuildingBlock.extend({
    type: 'field',
    add: function () {
        var self = this;
        return self._super.apply(this, arguments).then(function() {
            return new Promise(function (resolve, reject) {
                var field = {
                    order: 'order',
                    type: 'related',
                    filters: { searchable: false },
                filter: function (field) {
                    // For single fields (i.e. NOT a table), forbid putting x2many's
                    // Because it just doesn't make sense otherwise
                    return ! _.contains(['one2many', 'many2many'], field.type);
                }
                };

                var target = self.targets[0];
                if (self._filterTargets) {
                    target = self._filterTargets() || target;
                }

                var availableKeys = _.filter(self._getContextKeys(target.node), function (field) {
                    // "docs" is a technical object referring to all records selected to issue the report for
                    // it shouldn't be manipulated by the user
                    return !!field.relation && field.name !== 'docs';
                });
                var fieldChain = [];
                if (availableKeys.length) {
                    fieldChain.push(_.first(availableKeys).name);
                }
                var dialog = new NewFieldDialog(self, 'record_fake_model', field, availableKeys, fieldChain).open();
                dialog.on('field_default_values_saved', self, function (values) {
                    if (values.related.split('.').length < 2) {
                        Dialog.alert(self, _t('The record field name is missing'));
                    } else {
                        resolve({
                            inheritance: self._dataInheritance(values),
                        });
                        dialog.close();
                    }
                });
                dialog.on('closed', self, function () {
                    reject();
                });
            });
        });
    },
});

var BlockField = AbstractFieldBlock.extend({
    label: _lt('Field'),
    className: 'o_web_studio_field_many2one',
    hookClass: 'o_web_studio_hook_field',
    dropIn: '.page',
    _dataInheritance: function (values) {
        var $field = $('<span/>').attr('t-field', values.related);
        if (values.type === 'binary') {
            $field.attr('t-options-widget', '"image"');
        }
        var fieldHTML = $field.prop('outerHTML');

        return this._createContent({
            content: "<div class='row'><div class='col'>" + fieldHTML + "</div></div>",
        });
    },
});

var InlineField = AbstractFieldBlock.extend({
    label: _lt('Field'),
    className: 'o_web_studio_field_many2one',
    hookClass: 'o_web_studio_hook_inline',
    hookAutoHeight: true,
    dropIn: TextSelectorTags.split(',').join(filter + '|') + filter,
    selectorSeparator: '|',
    hookTag: 'span',
    _dataInheritance: function (values) {
        var $field = $('<span/>').attr('t-field', values.related);
        if (values.type === 'binary') {
            $field.attr('t-options-widget', '"image"');
        }
        var fieldHTML = $field.prop('outerHTML');
        if (this.node.tag === 'td' || this.node.tag === 'th') {
            return this._createReportTableColumn({
                head: $('<span/>').text(values.string).prop('outerHTML'),
                bodyLoop: fieldHTML,
            });
        } else {
            return this._createContent({
                content: fieldHTML,
            });
        }
    },
    _filterTargets: function () {
        var self = this;
        var target = this.targets[0];
        if (this.targets.length > 1 && (target.node.tag === 'td' || target.node.tag === 'th')) {
            target = _.find(this.targets, function (target) {
                return self._findParentWithTForeach(target.node) ? true : false;
            });
        }
        return target;
    },
});

var TableColumnField = AbstractFieldBlock.extend({
    label: _lt('Field Column'),
    className: 'o_web_studio_field_fa',
    fa: ' fa-plus-square',
    hookAutoHeight: true,
    hookClass: 'o_web_studio_hook_table_column',
    dropIn: 'tr',
    _dataInheritance: function (values) {
        var $field = $('<span/>').attr('t-field', values.related);
        if (values.type === 'binary') {
            $field.attr('t-options-widget', '"image"');
        }
        var fieldHTML = $field.prop('outerHTML');
        if (this.node.tag === 'td' || this.node.tag === 'th') {
            // add content either in looped cells, or if no loop in normal cells
            var targetInLoop = _.find(this.targets, function (target) {
                return this._findParentWithTForeach(target.node);
            }.bind(this)) ? true : false;
            return this._createReportTableColumn({
                head: $('<span/>').text(values.string).prop('outerHTML'),
                body: targetInLoop ? undefined : fieldHTML,
                bodyLoop: targetInLoop ? fieldHTML : undefined,
            });
        } else {
            return this._createContent({
                contentInStructure: '<span><strong>' + values.string + ':</strong><br/></span>' + fieldHTML,
                content: fieldHTML,
            });
        }
    },
    _filterTargets: function () {
        var self = this;
        var target = this.targets[this.targets.length - 1];
        if (this.targets.length > 1) {
            target = _.find(this.targets, function (target) {
                return self._findParentWithTForeach(target.node) ? true : false;
            });
        }
        return target;
    },
});

var TableCellField = AbstractFieldBlock.extend({
    label: _lt('Field in Cell'),
    className: 'o_web_studio_field_many2one',
    hookAutoHeight: false,
    hookClass: 'o_web_studio_hook_inline',
    dropIn: 'td, th',
    hookTag: 'span',
    _dataInheritance: function (values) {
        var $field = $('<span/>').attr('t-field', values.related);
        if (values.type === 'binary') {
            $field.attr('t-options-widget', '"image"');
        }
        var fieldHTML = $field.prop('outerHTML');
        if (this.node.tag === 'td' || this.node.tag === 'th') {
            return this._createReportTableColumn({
                head: $('<span/>').text(values.string).prop('outerHTML'),
                bodyLoop: fieldHTML,
            });
        } else {
            return this._createContent({
                contentInStructure: '<span><strong>' + values.string + ':</strong><br/></span>' + fieldHTML,
                content: fieldHTML,
            });
        }
    },
    _filterTargets: function () {
        var self = this;
        var target = this.targets[0];
        if (this.targets.length > 1) {
            target = _.find(this.targets, function (target) {
                return self._findParentWithTForeach(target.node) ? true : false;
            }) ;
        }
        return target;
    },
});

var LabelledField = AbstractFieldBlock.extend({
    label: _lt('Field & Label'),
    className: 'o_web_studio_field_many2one',
    hookClass: 'o_web_studio_hook_information',
    dropColumns: [[0, 3], [0, 3], [0, 3], [0, 3]],
    hookAutoHeight: false,
    dropIn: '.page, .row > div.col*:empty',
    _dataInheritance: function (values) {
        var $field = $('<span/>').attr('t-field', values.related);
        if (values.type === 'binary') {
            $field.attr('t-options-widget', '"image"');
        }
        var fieldHTML = $field.prop('outerHTML');

        return this._createContent({
            contentInStructure: '<span><strong>' + values.string + ':</strong><br/></span>' + fieldHTML,
            content: fieldHTML,
        });
    },
});



// ----------- OTHER -----------

var Image = AbstractNewBuildingBlock.extend({
    type: 'image',
    label: _lt('Image'),
    dropIn: '.page',
    className: 'o_web_studio_field_picture',
    hookClass: 'o_web_studio_hook_picture',
    add: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            var def = new Promise(function (resolve, reject) {
                var $image = $("<img/>");
                var dialog = new weWidgets.MediaDialog(self, {
                    onlyImages: true,
                }, $image[0]).open();
                var value;
                dialog.on("save", self, function (el) {
                    // el is a vanilla JS element
                    // Javascript Element.src returns the full url (including protocol)
                    // But we want only a relative path
                    // https://www.w3schools.com/jsref/prop_img_src.asp
                    // We indeed expect only one image at this point
                    value = el.attributes.src.value;
                });
                dialog.on('closed', self, function () {
                    if (value) {
                        resolve({
                            inheritance: self._createContent({
                                content: '<img class="img-fluid" src="' + value + '"/>',
                            })
                        });
                    } else {
                        reject();
                    }
                });
            });
            return def;
        });
    },
});

var BlockTitle = AbstractNewBuildingBlock.extend({
    type: 'block_title',
    label: _lt('Title Block'),
    className: 'o_web_studio_field_char',
    hookClass: 'o_web_studio_hook_title',
    dropIn: '.page',
    add: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            return Promise.resolve({
                inheritance: [{
                    content: '<div class="row"><div class="col h2"><span>New Title</span></div></div>',
                    position: self.position,
                    xpath: self.node.attrs['data-oe-xpath'],
                    view_id: +self.node.attrs['data-oe-id'],
                }],
            });
        });
    },
});

var BlockAddress = AbstractNewBuildingBlock.extend({
    type: 'block_address',
    label: _lt('Address Block'),
    fa: 'fa-address-card',
    className: 'o_web_studio_field_fa',
    hookAutoHeight: false,
    hookClass: 'o_web_studio_hook_address',
    structureClass: 'address',
    dropColumns: [[0, 5], [2, 5]],
    add: function () {
        var self = this;
        var callersArguments = arguments;
        return new Promise(function (resolve, reject) {
            self._super.apply(self, callersArguments).then(function () {
                var field = {
                    order: 'order',
                    type: 'related',
                    filters: {},
                    filter: function (field) {
                        return field.type === 'many2one';
                    },
                    followRelations: function (field) {
                        return field.type === 'many2one' && field.relation !== 'res.partner';
                    },
                };
                var availableKeys = self._getContextKeys(self.node);
                // TODO: maybe filter keys to only get many2one fields to res.partner?
                // For reports, set the current model ('doc') by default
                // in 'ModelFieldSelector' whenever available
                var fieldChain = [];
                if (availableKeys.length) {
                    fieldChain.push(_.first(availableKeys).name);
                }
                var dialog = new NewFieldDialog(self, 'record_fake_model', field, availableKeys, fieldChain).open();
                dialog.on('field_default_values_saved', self, function (values) {
                    if (!_.contains(values.related, '.')) {
                        Dialog.alert(self, _t('Please specify a field name for the selected model.'));
                        return;
                    }
                    if (values.relation === 'res.partner') {
                        resolve({
                            inheritance: self._createContent({
                                content: '<div t-field="' + values.related + '" t-options-widget="\'contact\'"/>',
                            })
                        });
                        dialog.close();
                    } else {
                        Dialog.alert(self, _t('You can only display a user or a partner'));
                    }
                });
                dialog.on('closed', self, function () {
                    reject();
                });
            });
        });
    },
});

var BlockTable = AbstractNewBuildingBlock.extend({
    type: 'block_table',
    label: _lt('Data table'),
    fa: 'fa-th-list',
    className: 'o_web_studio_field_fa',
    hookClass: 'o_web_studio_hook_table',
    dropIn: '.page',
    add: function () {
        var self = this;
        var callersArguments = arguments;
        return new Promise(function (resolve, reject) {
            self._super.apply(self, callersArguments).then(function () {
                var field = {
                    order: 'order',
                    type: 'related',
                    filters: {},
                    filter: function (field) {
                        return field.type === 'many2one' || field.type === 'one2many' || field.type === 'many2many';
                    },
                    followRelations: function (field) {
                        return field.type === 'many2one';
                    },
                };
                var availableKeys = self._getContextKeys(self.node);
                // For reports, set the current model ('doc') by default
                // in 'ModelFieldSelector' whenever available
                var fieldChain = [];
                if (availableKeys.length) {
                    fieldChain.push(_.first(availableKeys).name);
                }
                var dialog = new NewFieldDialog(self, 'record_fake_model', field, availableKeys, fieldChain).open();
                dialog.on('field_default_values_saved', self, function (values) {
                    if (values.type === 'one2many' || values.type === 'many2many') {
                        resolve({
                            inheritance: self._dataInheritance(values),
                        });
                        dialog.close();
                    } else {
                        Dialog.alert(self, _t('You need to use a many2many or one2many field to display a list of items'));
                    }
                });
                dialog.on('closed', self, function () {
                    reject();
                });
            });
        });
    },
    _dataInheritance: function (values) {
        var target = this.targets[0];
        return [{
            content:
                '<table class="table o_report_block_table">' +
                '<thead>' +
                '<tr>' +
                '<th><span>Name</span></th>' +
                '</tr>' +
                '</thead>' +
                '<tbody>' +
                '<tr t-foreach="' + values.related + '" t-as="table_line">' +
                '<td><span t-field="table_line.display_name"/></td>' +
                '</tr>' +
                '</tbody>' +
                '</table>',
            position: target.position,
            xpath: target.node.attrs['data-oe-xpath'],
            view_id: +target.node.attrs['data-oe-id'],
        }];
    },
});

var TableBlockTotal = AbstractNewBuildingBlock.extend({
    type: 'block_total',
    label: _lt('Subtotal & Total'),
    fa: 'fa-money',
    className: 'o_web_studio_field_fa',
    dropIn: '.page',
    hookClass: 'o_web_studio_hook_total',
    dropColumns: [[0, 5], [2, 5]],
    add: function () {
        var self = this;
        var callersArguments = arguments;
        return new Promise(function (resolve, reject) {
            self._super.apply(self, callersArguments).then(function () {
                var field = {
                    order: 'order',
                    type: 'related',
                    filters: {},
                    filter: function (field) {
                        return field.type === 'many2one';
                    },
                    followRelations: function (field) {
                        return field.type === 'many2one' &&
                            field.relation !== 'account.move' && field.relation !== 'sale.order';
                    },
                };
                var availableKeys = self._getContextKeys(self.node);
                // For reports, set the current model ('doc') by default
                // in 'ModelFieldSelector' whenever available
                var fieldChain = [];
                if (availableKeys.length) {
                    fieldChain.push(_.first(availableKeys).name);
                }
                var dialog = new NewFieldDialog(self, 'record_fake_model', field, availableKeys, fieldChain).open();
                dialog.on('field_default_values_saved', self, function (values) {
                    resolve({
                        inheritance: self._dataInheritance(values),
                    });
                    dialog.close();
                });
                dialog.on('closed', self, function () {
                    reject();
                });
            });
        });
    },
    _dataInheritance: function (values) {
        var data = this._dataInheritanceValues(values);
        return this._createContent({
            contentInStructure:
                '<table class="table table-sm o_report_block_total">' +
                '<t t-set="total_currency_id" t-value="' + data.currency_id + '"/>' +
                '<t t-set="total_amount_total" t-value="' + data.amount_total + '"/>' +
                '<t t-set="total_amount_untaxed" t-value="' + data.amount_untaxed + '"/>' +
                '<t t-set="total_amount_by_groups" t-value="' + data.amount_by_groups + '"/>' +
                '<tr class="border-black o_subtotal">' +
                    '<td><strong>Subtotal</strong></td>' +
                    '<td class="text-right">' +
                        '<span t-esc="total_amount_untaxed" t-options="{\'widget\': \'monetary\', \'display_currency\': total_currency_id}"/>' +
                    '</td>' +
                '</tr>' +
                '<t t-foreach="total_amount_by_groups" t-as="total_amount_by_group">' +
                    '<tr>' +
                        '<t t-if="len(total_amount_by_group) == 1 and total_amount_untaxed == total_amount_by_group[2]">' +
                            '<td><span t-esc="total_amount_by_group[0]"/></td>' +
                            '<td class="text-right o_price_total">' +
                                '<span t-esc="total_amount_by_group[3]"/>' +
                            '</td>' +
                        '</t>' +
                        '<t t-else="">' +
                            '<td>' +
                                '<span t-esc="total_amount_by_group[0]"/>' +
                                '<span><span>on</span>' +
                                    '<t t-esc="total_amount_by_group[4]"/>' +
                                '</span>' +
                            '</td>' +
                            '<td class="text-right o_price_total">' +
                                '<span t-esc="total_amount_by_group[3]"/>' +
                            '</td>' +
                        '</t>' +
                    '</tr>' +
                '</t>' +
                '<t t-if="total_amount_by_groups is None">' +
                    '<tr>' +
                        '<td>Taxes</td>' +
                        '<td class="text-right">' +
                            '<span t-esc="total_amount_total - total_amount_untaxed" t-options="{\'widget\': \'monetary\', \'display_currency\': total_currency_id}"/>' +
                        '</td>' +
                    '</tr>' +
                '</t>' +
                '<tr class="border-black o_total">' +
                    '<td><strong>Total</strong></td>' +
                    '<td class="text-right">' +
                        '<span t-esc="total_amount_total" t-options="{\'widget\': \'monetary\', \'display_currency\': total_currency_id}"/>' +
                    '</td>' +
                '</tr>' +
                '</table>',
        });
    },
    _dataInheritanceValues: function (values) {
        var currency_id = values.related.split('.')[0] + ".env.company.currency_id";
        var amount_untaxed = '0.0';
        var amount_total = '0.0';
        var amount_by_groups = 'None';
        if (values.relation === 'account.move') {
            currency_id = values.related + '.currency_id';
        }
        if (values.relation === 'sale.order') {
            currency_id = values.related + '.pricelist_id.currency_id';
        }
        if (values.relation === 'account.move' || values.relation === 'sale.order') {
            amount_untaxed = values.related + '.amount_untaxed';
            amount_by_groups = values.related + '.amount_by_group';
            amount_total = values.related + '.amount_total';
        }
        return {
            currency_id: currency_id,
            amount_total: amount_total,
            amount_untaxed: amount_untaxed,
            amount_by_groups: amount_by_groups,
        };
    },
});


return {
    BlockText: BlockText,
    InlineText: InlineText,
    ColumnHalfText: ColumnHalfText,
    ColumnThirdText: ColumnThirdText,
    TableCellText: TableCellText,
    BlockField: BlockField,
    InlineField: InlineField,
    TableColumnField: TableColumnField,
    TableCellField: TableCellField,
    LabelledField: LabelledField,
    Image: Image,
    BlockTitle: BlockTitle,
    BlockAddress: BlockAddress,
    BlockTable: BlockTable,
    TableBlockTotal: TableBlockTotal,
};

});
