odoo.define('web_studio.ReportEditor', function (require) {
"use strict";

var core = require('web.core');
var Widget = require('web.Widget');

var EditorMixin = require('web_studio.EditorMixin');

var _t = core._t;

var ReportEditor = Widget.extend(EditorMixin, {
    template: 'web_studio.ReportEditor',
    nearest_hook_tolerance: 500,
    events: _.extend({}, Widget.prototype.events, {
        'click': '_onClick',
    }),

    /**
     * @override
     *
     * @param {Widget} parent
     * @param {Object} params
     * @param {Object} params.nodesArchs
     * @param {String} params.reportHTML
     * @param {Object} [params.paperFormat]
     */
    init: function (parent, params) {
        this._super.apply(this, arguments);

        this.nodesArchs = params.nodesArchs;
        this.reportHTML = params.reportHTML;

        this.paperFormat = params.paperFormat || {};

        this.$content = $();
        this.$noContentHelper = $();

        this.selectedNode = null;
        this.$targetHighlight = $();

        this.$dropZone = $();
        this._onUpdateContentId = _.uniqueId('_processReportPreviewContent');
        this.isDragging = false;
    },
    /**
     * @override
     */
    start: function () {
        this.$iframe = this.$('iframe');
        this.$iframe.one('load', this._updateContent.bind(this));
        return this._super.apply(this, arguments);
    },
    /**
     * @override
     */
    destroy: function () {
        window.top[this._onUpdateContentId] = null;
        delete window.top[this._onUpdateContentId];
        if (this.$content) {
            this.$content.off('click');
            this.$content.off('load');
        }
        return this._super.apply(this, arguments);
    },
    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Start dragging the component, notify that no cleanup should occur
     * because a drag operation is ongoing.
     */
    beginDragComponent: function (component) {
        this.isDragging = true;
        if (this.$content.find('.o_web_studio_hook').length === 0) {
            // for the case where computing the hooks takes long and
            // the user is too fast with the mouse
            this._prepareHooksOnIframeBeforeDrag(component);
        }
    },
    beginPreviewDragComponent: function (component) {
        if (this.isDragging) {
            return;
        }
        this._prepareHooksOnIframeBeforeDrag(component);
    },
    /**
    * Insert Studio hooks in the dom iframe, according to which building block
    * is being dragged.
    *
    * @param {Component} component the building block being dragged
    */
    _prepareHooksOnIframeBeforeDrag: function (component) {
        var self = this;

        this._cleanHooks();
        this.$noContentHelper.remove();

        var dropIn = component.dropIn;
        if (component.dropColumns && component.addEmptyRowsTargets) {
            dropIn = (dropIn ? dropIn + ',' : '') + '.page > .row > div:empty';
        }
        if (dropIn) {
            var inSelectors = dropIn.split(component.selectorSeparator || ',');
            _.each(inSelectors, function (selector) {
                var $target = self.$content.find(selector + "[data-oe-xpath]");
                _.each($target, function (node) {
                    if (!$(node).data('node')) {
                        // this is probably a template not present in
                        // reportViews so no hook should be attached to it
                        // TODO: should the corresponding view be branded
                        // (server-side) in this case (there won't be any
                        // data-oe-xpath then)?
                        return;
                    }
                    self._createHookOnNodeAndChildren($(node), component);
                });
            });
        }
        if (component.dropColumns) {
            // when dropping the component, it should have a specific (bootstrap) column structure
            // we will create this structure or complete it if it already exist
            var $hook = self._createHook($('<div/>'), component);
            var $gridHooks = $('<div class="row o_web_studio_structure_hook"/>');
            _.each(component.dropColumns, function (column, index) {
                var $col = $('<div class="offset-' + column[0] + ' col-' + column[1] + '"/>');
                $col.append($hook.clone().attr('data-oe-index', index));
                $gridHooks.append($col);
            });

            var $page = this.$content.find('.page');
            var $children = $page.children().not('.o_web_studio_hook');

            if ($children.length) {
                $gridHooks.find('.o_web_studio_hook').data('oe-node', $children.first()).data('oe-position', 'before');
                $children.first().before($gridHooks);

                _.each($children, function (child) {
                    var $child = $(child);
                    var $newHook = $gridHooks.clone();
                    $newHook.find('.o_web_studio_hook').data('oe-node', $child).data('oe-position', 'after');
                    $child.after($newHook);
                });
            } else {
                $gridHooks.find('.o_web_studio_hook').data('oe-node', $page).data('oe-position', 'inside');
                $page.prepend($gridHooks);
            }

            this.$content.find('.o_web_studio_structure_hook + .o_web_studio_hook').remove();
            this.$content.find('.o_web_studio_structure_hook').prev('.o_web_studio_hook').remove();
        }
        this.$content.find('.o_web_studio_hook + .o_web_studio_hook').remove();
        this.$dropZone = this.$content.find('.o_web_studio_hook');

        this.$dropZoneStructure = this.$content.find('.o_web_studio_structure_hook');
        this.$dropZoneStructure.removeClass('.o_web_studio_nearest').each(function () {
            $(this).children().children('.o_web_studio_hook:only-child').data('height', $(this).height() + 'px');
        });

        // compute the size box with the nearest rendering
        this._computeNearestHookAndShowIt();

        // association for td and colspan
        this.$dropZone.filter('th, td').each(function (_, item) {
            var $item = $(item);
            var $node = $item.data('oe-node');
            var colspan = +$node.data('colspan');
            if (colspan > 1) {
                $node.attr('colspan', colspan * 2 - 1);
            }
        });
    },
    /**
     * When a component is being dragged in the iframe, this function computes
     * which Studio hook(s) are the nearest.
     *
     * @param {Component} component
     * @param {integer} x
     * @param {integer} y
     */
    dragComponent: function (component, x, y) {
        this.isDragging = true;
        this.$dropZone
            .filter('.o_web_studio_nearest_hook')
            .removeClass('o_web_studio_nearest_hook')
            .closest(this.$dropZoneStructure).each(function () {
                $(this).children().css('height', '').children('.o_web_studio_hook:only-child').css('height', '');
            });

        this.$dropZoneStructure.removeClass('o_web_studio_nearest');

        var bound = this.$iframe[0].getBoundingClientRect();
        var isInIframe = (x >= bound.left && x <= bound.right) && (y >= bound.top && y <= bound.bottom);
        if (!isInIframe) {
            return;
        }

        // target with position of the box center
        _.each(this.dropPosition, function (box) {
            box.dist = Math.sqrt(Math.pow(box.centerY - (y - bound.top), 2) + Math.pow(box.centerX - (x - bound.left), 2));
        });
        this.dropPosition.sort(function (a, b) {
            return a.dist - b.dist;
        });

        if (!this.dropPosition[0] || this.dropPosition[0].dist > this.nearest_hook_tolerance) {
            return;
        }

        var $nearestHook = $(this.dropPosition[0].el);

        $nearestHook
            .addClass('o_web_studio_nearest_hook')
            .closest(this.$dropZoneStructure)
            .addClass('o_web_studio_nearest');

        if (!$nearestHook.data('oe-node') || !$nearestHook.data('oe-node').data('oe-id')) {
            return;
        }

        var $node = $nearestHook.data('oe-node');
        var id = $node.data('oe-id');
        var xpath = $node.data('oe-xpath');
        var position = $nearestHook.data('oe-position');
        var index = $nearestHook.data('oe-index');

        var td = $node.is('td, th');
        var reg, replace;
        if (td) {
            reg = /^(.*?)\/(thead|tbody|tfoot)(.*?)\/(td|th)(\[[0-9]+\])?/;
            replace = td && position === 'inside' ? '$1/$2/tr/td' : '$1/tr/td';
            xpath = xpath.replace(reg, replace);
        }

        // select all dropzone with the same xpath
        var $nearestHooks = this.$dropZone.filter(function () {
            var $hook = $(this);
            var $node = $hook.data('oe-node');
            return $hook.data('oe-position') === position &&
                $hook.data('oe-index') === index &&
                $node.data('oe-id') === id &&
                (td ? $node.data('oe-xpath').replace(reg, replace) : $node.data('oe-xpath')) === xpath;
        });

        if (td) {
            var pos = $nearestHook.data('oe-node').data('td-position-' + (position === 'before' ? 'before' : 'after'));
            $nearestHooks = $nearestHooks.filter(function () {
                var $node = $(this).data('oe-node');
                return $node.data('td-position-' + (position === 'before' ? 'before' : 'after')) === pos;
            });
        }

        $nearestHooks.addClass('o_web_studio_nearest_hook');
    },
    /**
     * When a component has been dropped in the iframe, we genrate the changes
     * in the view and clean the hooks.
     *
     * @param {Component} component
     */
    dropComponent: function (component) {
        this.isDragging = false;
        var $nearestHooks = this.$dropZone.filter('.o_web_studio_nearest_hook');
        var targets = [];

        // targets need to contain all the targets that are unique (oe-id, oe-xpath)
        $nearestHooks.get().forEach(function (nearHook) {
            var $active = $(nearHook);
            var alreadyAdded = false;
            var nodeData = $active.data('oe-node').data('node');

            for (var i = 0; i < targets.length; i++) {
                if (targets[i].node.attrs['data-oe-id'] === nodeData.attrs['data-oe-id'] &&
                    targets[i].node.attrs['data-oe-xpath'] === nodeData.attrs['data-oe-xpath']) {
                    alreadyAdded = true;
                }
            }
            if (!alreadyAdded) {
                targets.push({
                    node: nodeData,
                    position: $active.data('oe-position'),
                    data: $active.data(),
                });
            }
        });

        if (targets.length) {
            this.trigger_up('view_change', {
                component: component,
                fail: this._cleanHooks.bind(this),
                targets: targets,
                operation: {
                    type: 'add',
                    position: $nearestHooks.first().data('oe-position'),
                },
            });
        } else {
            this._cleanHooks();
        }
    },

    endPreviewDragComponent: function (component) {
        this._cleanHooks();
    },
    /**
     * Get the context associated to a node.
     *
     * @param {Object} initialNode
     * @returns {Object}
     */
    getNodeContext: function (initialNode) {
        var node = initialNode;
        var $nodes = this._findAssociatedDOMNodes(node);
        while (!$nodes.length && node.parent) {
            var index = node.parent.children.indexOf(node);
            for (index; index > 0; index--) {
                $nodes = this._findAssociatedDOMNodes(node.parent.children[index]);
                if ($nodes.length) {
                    break;
                }
            }
            if (!$nodes.length) {
                node = node.parent;
            }
        }
        if (!$nodes.length) {
            $nodes = this.$content.find('*[data-oe-xpath]');
        }

        return $nodes.data('oe-context');
    },
    /**
     * Highlight (shows a red arrow on) a DOM node.
     *
     * @param {Object} node
     */
    highlight: function (node) {
        if (!this.$highlight) {
            // an arrow that helps understanding which DOM element is being edited
            this.$highlight = $('<span class="o_web_studio_report_highlight"/>');
            this.$content.find('body').prepend(this.$highlight);
        }

        if (this.$targetHighlight.data('node') !== this.selectedNode) {
            // do not remove the highlight on the clicked node
            this.$targetHighlight.removeClass('o_web_studio_report_selected');
        }

        var $nodes = this._findAssociatedDOMNodes(node);
        if ($nodes && $nodes.length) {
            this.$targetHighlight = $nodes.addClass('o_web_studio_report_selected');
            var position = this.$targetHighlight.offset();
            this.$highlight
                .css({
                    top: position.top + 'px',
                    left: position.left + 'px',
                    bottom: position.top < 50 ? '0' : 'auto',
                })
                .toggleClass('o_web_studio_report_highlight_left', position.left < 50)
                .toggleClass('o_web_studio_report_highlight_top', position.top < 50)
                .show();
        } else {
            this.$highlight.hide();
        }
    },
    /**
     * Selects the given node if it's not already selected and deselects
     * previously selected one.
     *
     * @private
     * @param {Object} node
     */
    selectNode: function (node) {
        if (this.selectedNode) {
            if (this.selectedNode === node) {
                return;
            }
            var $oldSelectedNodes = this._findAssociatedDOMNodes(this.selectedNode);
            $oldSelectedNodes.removeClass('o_web_studio_report_selected');
        }

        this.selectedNode = node;
        var $nodesToHighlight = this._findAssociatedDOMNodes(this.selectedNode);
        $nodesToHighlight.addClass('o_web_studio_report_selected');
    },
    /**
     * @override
     */
    unselectedElements: function () {
        var $nodes = this._findAssociatedDOMNodes(this.selectedNode);
        $nodes.removeClass('o_web_studio_report_selected');
        this.selectedNode = null;
    },
    /**
     * Update the iframe content with a new HTML description.
     *
     * @param {Object} nodesArchs
     * @param {String} reportHTML
     * @returns {Promise}
     */
    update: function (nodesArchs, reportHTML) {
        var self = this;
        this.nodesArchs = nodesArchs;
        this.reportHTML = reportHTML;

        this.$dropZone = $();

        return this._updateContent().then(function () {
            if (self.selectedNode) {
                var $nodes = self._findAssociatedDOMNodes(self.selectedNode);
                if ($nodes.length) {
                    $nodes.first().click();
                } else {
                    self.selectedNode = null;
                    self.trigger_up('sidebar_tab_changed', {
                        mode: 'new',
                    });
                }
            }
        });
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Clean displayed hooks and reset colspan on modified nodes.
     *
     * @private
     */
    _cleanHooks: function () {
        if (this.isDragging) {
            return;
        }

        this.$dropZone.filter('th, td').each(function () {
            var $node = $(this).data('oe-node');
            if ($node) {
                var colspan = $node.data('colspan');
                if (colspan) {
                    $node.attr('colspan', colspan);
                }
            }
        });
        this.$content.find('.o_web_studio_hook').remove();
        this.$content.find('.o_web_studio_structure_hook').remove();

        this._setNoContentHelper();
    },
    /**
     * Create hook on target and compute its size.
     *
     * @private
     * @param {jQuery} $node report dom node that should be hooked onto
     * @param {Object} sidebar component currently being dragged
     */
    _createHookOnNodeAndChildren: function ($node, component) {
        var $hook = this._createHook($node, component);
        var $newHook = $hook.clone();
        var $children = $node.children()
            .not('.o_web_studio_hook')

        // display the hook with max height of this sibling
        if ($children.length === 1 && $children.is('td[colspan="99"]')) {
            return;
        }
        if ($children.length) {
            if (component.hookAutoHeight) {
                var height = Math.max.apply(Math, $children.map(function () { return $(this).height(); }));
                $newHook.data('height', height + 'px');
                $newHook.css('height', height + 'px');
            }
            $newHook.data('oe-node', $children.first()).data('oe-position', 'before');
            $children.first().before($newHook);

            $children.each(
                /* allows to drop besides each children */
                function (_, childNode) {
                    var $childNode = $(childNode);
                    var $newHook = $hook.clone().data('oe-node', $childNode).data('oe-position', 'after');
                    if (component.hookAutoHeight) {
                        $newHook.data('height', height + 'px');
                        $newHook.css('height', height + 'px');
                    }
                    $childNode.after($newHook);
                });
        } else if ($node.text() &&
                    $node[0].tagName.toLowerCase() !== 'th' &&
                    $node[0].tagName.toLowerCase() !== 'td') {
                    // in tables, we cannot add span hooks else it breaks the layout
            if (component.hookAutoHeight) {
                $newHook.data('height', $node.height() + 'px');
                $newHook.css('height', $node.height() + 'px');
            }
            $node.before($newHook.clone().data('oe-node', $node).data('oe-position', 'before'));
            $node.after($newHook.clone().data('oe-node', $node).data('oe-position', 'after'));
        }
        else {
            $newHook.data('oe-node', $node).data('oe-position', 'inside');
            $node.append($newHook);
        }
    },
    _computeNearestHookAndShowIt: function () {
        var self = this;
        this.dropPosition = [];
        var dropZone = this.$dropZone.get();
        dropZone.reverse();
        _.each(dropZone, function (node) {
            var $node = $(node);
            var box = node.getBoundingClientRect();
            box.el = node;
            box.centerY = (box.top + box.bottom) / 2;
            box.centerX = (box.left + box.right) / 2;
            self.dropPosition.push(box);
        });
    },
    /**
     * Recursively parses the DOM of the report and add the `data` and `attributes` on every DOM nodes,
     * according to the qWeb template that generated the report.
     *
     * After this function, every node in the DOM and in memory will have access to their context
     *
     * @private
     */
    _connectNodes: function () {
        var self = this;
        var nodesNotInView = [];

        function connectNodes(node) {
            if (!node.attrs) {
                return;
            }
            var $nodes = self._findAssociatedDOMNodes(node);
            $nodes.data('node', node);
            node.$nodes = $nodes;
            if ($nodes.length) {
                node.context = $nodes.data('oe-context');
            } else {
                nodesNotInView.push(node);
            }

            _.each(node.attrs, function (value, key) {
                if ($nodes.attr(key) === undefined) {
                    $nodes.attr(key, value);
                }
            });
            _.each(node.children, connectNodes);
        }
        _.each(this.nodesArchs, connectNodes);


        function connectContextOrder(dom, contextOrder) {
            var $node = $(dom);
            var newOrder = contextOrder.slice();
            var node = $node.data('node');

            if (node) {
                if (node.contextOrder) {
                    return node.contextOrder;
                }
                newOrder = node.contextOrder = _.uniq(contextOrder.concat(_.keys(node.context)));
            }

            var children = $node.children().get();
            for (var k = 0; k < children.length; k++) {
                newOrder = connectContextOrder(children[k], newOrder);
            }
            return newOrder;
        }

        var children = this.$content.children().get();
        for (var k = 0; k < children.length; k++) {
            connectContextOrder(children[k], []);
        }

        var bodyContext = this.$content.find('html').data('oe-context');
        _.each(nodesNotInView, function (node) {
            node.context = node.parent && node.parent.context || bodyContext;
        });
    },
    /**
     * @private
     * @param {jQuery} $target
     * @param {Component} component
     * @returns {jQuery}
     */
    _createHook: function ($target, component) {
        var firstChild = $target.children().get(0);
        var hookTag = ((firstChild && firstChild.tagName) || 'div').toLocaleLowerCase();
        if (!$target.is('tr') && component.hookTag) {
            hookTag = component.hookTag;
        }
        if (hookTag === 'table') {
            hookTag = 'div';
        }
        var $hook = $('<' + hookTag + ' class="o_web_studio_hook"/>');
        if ($target.hasClass('row')) {
            $hook.addClass('col-3');
        }
        if (component.hookClass) {
            $hook.addClass(component.hookClass);
        }
        return $hook;
    },
    /**
     * finds all the DOM nodes that share the same context as the node in parameter.
     * Example, all the cells of the same column are sharing the same context: they come from the same report template.
     *
     * @private
     * @param {Object} node qWeb node
     * @returns {jQuery} associated DOM nodes
     */
    _findAssociatedDOMNodes: function (node) {
        if (node) {
            return this.$content.find('[data-oe-id="' + node.attrs['data-oe-id'] + '"][data-oe-xpath="' + node.attrs['data-oe-xpath'] + '"]');
        } else {
            return $();
        }
    },
    /**
     * takes the content of the report preview (in the iframe) to
     * - adds all the node meta-data
     * - ensure its size is correct
     * - add meta-data about colspan to make the drag&drop easier
     * @private
     */
    _processReportPreviewContent: function () {
        this.$content = this.$('iframe').contents();
        this.$content.off('click').on('click', this._onContentClick.bind(this));
        this._connectNodes();
        this.$('.o_web_studio_loader').hide();
        this._resizeIframe();

        // association for td and colspan
        this.$content.find('tr').each(function () {
            var $tr = $(this);
            var $tds = $tr.children();
            var lineMax = 0;
            $tds.each(function () {
                var $td = $(this);
                var colspan = +$td.attr('colspan');
                $td.data('colspan', colspan || 1);
                $td.data('td-position-before', lineMax);
                lineMax += colspan || 1;
                $td.data('td-position-after', lineMax);
            });
        });

        this._setNoContentHelper();
    },
    /**
     * @private
     */
    _resizeIframe: function () {
        var self = this;
        // zoom content from 96 (default browser DPI) to paperformat DPI
        var zoom = 96 / this.paperFormat.dpi;
        // scale each section either to fit DPI or shrinking to fit page (wkhtmltopdf enable-smart-shrinking)
        self.$content.find('main:first').children().each(function () {
            var sectionZoom = Math.min(zoom, $(this).width() / this.scrollWidth);
            $(this).css({zoom: sectionZoom});
        });
        // WHY --> so that after the load of the iframe, if there are images,
        // the iframe height is recomputed to the height of the content images included
        self.$iframe[0].style.height = self.$iframe[0].contentWindow.document.body.scrollHeight + 'px';

        // TODO: it seems that the paperformat doesn't exactly do that
        // this.$content.find('.header').css({
        //     'margin-bottom': (this.paperFormat.header_spacing || 0) + 'mm',
        // });
        // TODO: won't be pretty if the content is larger than the format
        this.$content.find('.footer').css({
            'position': 'fixed',
            'bottom': '0',
            'width': this.$content.find('.page').css('width'),
        });

        this.$content.find('html')[0].style.overflow = 'hidden';

        // set the size of the iframe
        $(this.$content).find("img").on("load", function () {
            self.$iframe[0].style.height = self.$iframe[0].contentWindow.document.body.scrollHeight + 'px';
        });
    },
    /**
     * @private
     */
    _setNoContentHelper: function () {
        var $page = this.$content.find('div.page');
        if ($page.length && !$page.children().length) {
            this.$noContentHelper = $('<div/>', {
                class: 'o_no_content_helper',
                text: _t('Drag building block here'),
            });
            $page.append(this.$noContentHelper);
        }
    },
    /**
     * Update the iframe content.
     *
     * @private
     * @returns {Promise}
     */
    _updateContent: function () {
        var self = this;
        this.$content = this.$iframe.contents();
        var reportHTML = this.reportHTML;

        var $main = this.$content.find('main:first');
        if ($main.length) {
            $main.replaceWith($(reportHTML).find('main:first'));
            this._processReportPreviewContent();
            return Promise.resolve();
        }

        return new Promise(function (resolve, reject) {
            window.top[self._onUpdateContentId] = function () {
                if (!self.$('iframe')[0].contentWindow) {
                    return reject();
                }
                self._processReportPreviewContent();
                self.trigger_up('iframe_ready');
                resolve();
            };
            if (reportHTML.error) {
                throw new Error(reportHTML.message || reportHTML.error);
            } else {
                // determine when the body has been inserted
                reportHTML = reportHTML.replace(
                    '</body>',
                    '<script>window.top.' + self._onUpdateContentId + '()</script></body>'
                );
            }

            // inject HTML
            var cwindow = self.$iframe[0].contentWindow;
            cwindow.document
                .open("text/html", "replace")
                .write(reportHTML);
        });
    },
    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onClick: function () {
        this.trigger_up('editor_clicked');
    },
    /**
     * @private
     * @param {Event} e
     */
    _onContentClick: function (e) {
        e.preventDefault();
        e.stopPropagation();

        if ($(e.target).hasClass('o_no_content_helper')) {
            return;
        }

        var $node = $(e.target).closest('[data-oe-xpath]');
        if ($node.closest('[t-field], [t-esc]').length) {
            $node = $node.closest('[t-field], [t-esc]');
        }
        this.selectNode($node.data('node'));
        this.trigger_up('node_clicked', {
            node: this.selectedNode,
        });
    },
});

return ReportEditor;

});
