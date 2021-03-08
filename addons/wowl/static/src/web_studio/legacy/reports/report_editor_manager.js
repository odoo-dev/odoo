odoo.define('web_studio.ReportEditorManager', function (require) {
"use strict";

var Dialog = require('web.Dialog');
var Pager = require('web.Pager');
var utils = require('web.utils');
var core = require('web.core');
var session = require('web.session');

var ReportEditorSidebar = require('web_studio.ReportEditorSidebar');
var ReportEditor = require('web_studio.ReportEditor');
var AbstractEditorManager = require('web_studio.AbstractEditorManager');
const { ComponentWrapper, WidgetAdapterMixin } = require('web.OwlCompatibility');

var qweb = core.qweb;
var _t = core._t;

var ReportEditorManager = AbstractEditorManager.extend(WidgetAdapterMixin, {
    className: AbstractEditorManager.prototype.className + ' o_web_studio_report_editor_manager',
    custom_events: _.extend({}, AbstractEditorManager.prototype.custom_events, {
        editor_clicked: '_onEditorClick',
        hover_editor: '_onHighlightPreview',
        node_expanded: '_onNodeExpanded',
        drop_component: '_onDropComponent',
        begin_drag_component: '_onBeginDragComponent',
        element_removed: '_onElementRemoved',
        iframe_ready: '_onIframeReady',
        begin_preview_drag_component: '_onBeginPreviewDragComponent',
        end_preview_drag_component: '_onEndPreviewDragComponent',
        pager_changed: '_onPagerChanged',
    }),
    events: _.extend({}, AbstractEditorManager.prototype.events, {
        'click .o_web_studio_report_print': '_onPrintReport',
    }),
    /**
     * @override
     * @param {Object} params
     * @param {Object} params.env - environment (model and ids)
     * @param {Object} params.models
     * @param {Object} params.report
     * @param {Object} params.reportHTML
     * @param {Object} params.reportMainViewID
     * @param {Object} params.reportViews
     * @param {Object} [params.initialState]
     * @param {string} [params.initialState.sidebarMode] among ['add', 'report']
     * @param {Object} [params.paperFormat]
     * @param {Object} [params.widgetsOptions]
     */
    init: function (parent, params) {
        this._super.apply(this, arguments);

        this.view_id = params.reportMainViewID;

        this.env = params.env;
        this.models = params.models;
        this.report = params.report;
        this.reportHTML = params.reportHTML;
        this.reportName = this.report.report_name;
        this.reportViews = params.reportViews;

        this.initialState = params.initialState || {};
        this.paperFormat = params.paperFormat;
        this.widgetsOptions = params.widgetsOptions;

        this.editorIframeResolved = false;
        var self = this;
        this.editorIframeDef = new Promise(function (resolve, reject) {
            self._resolveEditorIframeDef = resolve;
        }).then(function () {
            self.editorIframeResolved = true;
        });
        const currentMinimum = 1;
        const size = this.env.ids.length;
        const limit = 1;
        this.withPager = size > 1;
        if (this.withPager) {
            // only display the pager if useful
            this.pager = new ComponentWrapper(this, Pager, { currentMinimum, limit, size });
        }
    },
    /**
     * @override
     */
    start: async function () {
        const promises = [this._super(...arguments)];
        if (this.withPager) {
            const pagerPromise = this.pager.mount(document.createDocumentFragment());
            promises.push(pagerPromise);
        }
        await Promise.all(promises);
        this._renderActionsSection();
        this._setPaperFormat();
    },
    /**
     * @override
     */
    destroy: function () {
        WidgetAdapterMixin.destroy.apply(this, arguments);
        return this._super.apply(this, arguments);
    },
    /**
     * @override
     */
    on_attach_callback: function () {
        this._super.apply(this, arguments);
        WidgetAdapterMixin.on_attach_callback.apply(this, arguments);
    },
    /**
     * @override
     */
    on_detach_callback: function () {
        this._super.apply(this, arguments);
        WidgetAdapterMixin.on_detach_callback.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    updateEditor: function () {
        var nodesArchs = this._computeView(this.reportViews);
        return this.view.update(nodesArchs, this.reportHTML);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _applyChangeHandling: function (result, opID, from_xml) {
        var self = this;

        if (result.report_html.error) {
            // the operation can't be applied
            var error = result.report_html.message
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
            var msg = '<pre>' + error + '</pre>';
            this.do_warn(_t("Error when compiling AST"), msg, true);
            return this._undo(opID, true).then(function () {
                return Promise.reject();
            });
        }

        // TODO: what should we do with result? Maybe update the studio_view_id
        // if one has been created?
        if (!from_xml) {
            // reset studio_arch as it was before the changes for applying
            // the next operations
            _.each(result.views, function (view) {
                if (view.studio_view_id) {
                    view.studio_arch = self.reportViews[view.view_id].studio_arch;
                }
            });
        }
        this.reportViews = result.views;
        this.reportHTML = result.report_html;

        return this.updateEditor();
    },
    /**
     * @private
     * @param {Object} views
     * @returns {Object}
     */
    _computeView: function (views) {
        // TODO: find a better name
        var nodesArchs = _.mapObject(views, function (view, id) {
            var doc = $.parseXML(view.arch).documentElement;
            // first element child because we don't want <template> node
            if (!doc.hasAttribute('t-name')) {
                doc = doc.firstElementChild;
            }
            var node = utils.xml_to_json(doc, true);
            node.id = +id;
            node.key = view.key;
            return node;
        });

        this._setParentKey(nodesArchs);

        return nodesArchs;
    },
    /**
     * @override
     */
    _editView: function (view_id, studio_view_arch, operations) {
        core.bus.trigger('clear_cache');
        return this._rpc({
            route: '/web_studio/edit_report_view',
            params: {
                record_id: this.env.currentId,
                report_name: this.reportName,
                report_views: this.reportViews,
                operations: operations,
                context: session.user_context,
            },
        });
    },
    /**
     * @override
     */
    _editViewArch: function (view_id, view_arch) {
        core.bus.trigger('clear_cache');
        return this._rpc({
            route: '/web_studio/edit_report_view_arch',
            params: {
                record_id: this.env.currentId,
                report_name: this.reportName,
                view_id: view_id,
                view_arch: view_arch,
                context: session.user_context,
            },
        });
    },
    /**
     * @private
     * @param {Object} node
     * @returns {Object} first lonely node
     */
    _getNodeToDelete: function (node) {
        var result = node;
        while (
            result.parent &&
            result.parent.children.length === 1 &&  // last child
            result.attrs['data-oe-id'] === result.parent.attrs['data-oe-id'] &&  // same view
            (!result.attrs.class || result.attrs.class.indexOf('page') !== -1)  // cannot delete .page
        ) {
            result = result.parent;
        }
        return result;
    },
    /**
     * @private
     * @returns {Promise<Object>}
     */
    _getReportViews: function () {
        return this._rpc({
            route: '/web_studio/get_report_views',
            params: {
                record_id: this.env.currentId,
                report_name: this.reportName,
                context: session.user_context,
            },
        });
    },
    /**
     * @override
     */
    _instantiateEditor: function () {
        var nodesArchs = this._computeView(this.reportViews);
        this.view = new ReportEditor(this, {
            nodesArchs: nodesArchs,
            paperFormat: this.paperFormat,
            reportHTML: this.reportHTML,
        });
        return Promise.resolve(this.view);
    },
    /**
     * @override
     */
    _instantiateSidebar: function (state, previousState) {
        state = _.defaults(state || {}, {
            mode: this.initialState.sidebarMode || 'new',
        });
        return new ReportEditorSidebar(this, {
            report: this.report,
            widgetsOptions: this.widgetsOptions,
            models: this.models,
            state: state,
            previousState: previousState,
            paperFormat: this.paperFormat,
        });
    },
    /**
     * This section contains the 'Print' button and the pager.
     *
     * @private
     */
    _renderActionsSection: async function () {
        const actionsSection = Object.assign(document.createElement('div'), {
            className: 'o_web_studio_report_actions',
            innerHTML: qweb.render('web_studio.PrintSection'),
        });
        this.el.appendChild(actionsSection);

        if (this.withPager) {
            const pagerContainer = Object.assign(document.createElement('div'), {
                className: 'o_web_studio_report_pager',
            });
            pagerContainer.appendChild(this.pager.el);
            actionsSection.append(pagerContainer);
        }
    },
    /**
     * @private
     * @param {Object} nodesArchs
     */
    _setParentKey: function (nodesArchs) {
        function setParent(node, parent) {
            if (_.isObject(node)) {
                node.parent = parent;
                _.each(node.children, function (child) {
                    setParent(child, node);
                });
            }
        }
        _.each(nodesArchs, function (node) {
            setParent(node, null);
        });
    },
    /**
     * @private
     */
    _setPaperFormat: function () {
        var format = this.paperFormat || {};

        var $container = this.$('.o_web_studio_report_iframe_container');
        $container.css({
            'padding-top': Math.max(0, (format.margin_top || 0) - (format.header_spacing || 0)) + 'mm',
            'padding-left': (format.margin_left || 0) + 'mm',
            'padding-right': (format.margin_right || 0) + 'mm',
            // note: default width/height comes from default A4 size
            'width': (format.print_page_width || 210) + 'mm',
            // avoid a scroll bar with a fixed height
            'min-height': (format.print_page_height || 297) + 'mm',
        });

        this.$('.o_web_studio_report_iframe').css({
            // to remove
            'min-height': (format.print_page_height || 297) + 'mm',
            // 'max-height': document.body.scrollHeight + 'px',
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onBeginDragComponent: function (ev) {
        this.view.beginDragComponent(ev.data.widget);
    },
    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onBeginPreviewDragComponent: function (ev) {
        this.view.beginPreviewDragComponent(ev.data.widget);
    },
    /**
     * @override
     */
    _onDragComponent: function (ev) {
        var position = ev.data.position;
        this.view.dragComponent(ev.data.widget, position.pageX, position.pageY);
    },
    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onDropComponent: function (ev) {
        this.view.dropComponent(ev.data.widget);
    },
    /**
     * @private
     */
    _onEditorClick: function () {
        this.view.unselectedElements();
    },
    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onElementRemoved: function (ev) {
        var self = this;
        var node = this._getNodeToDelete(ev.data.node);
        var message = _.str.sprintf(_t('Are you sure you want to remove this %s from the view?'), node.tag);

        Dialog.confirm(this, message, {
            confirm_callback: function () {
                self.trigger_up('view_change', {
                    node: node,
                    operation: {
                        type: 'remove',
                        structure: 'remove',
                    },
                });
            },
        });
    },
        /**
     * @private
     * @param {OdooEvent} ev
     */
    _onEndPreviewDragComponent: function (ev) {
        this.view.endPreviewDragComponent(ev.data.widget);
    },
    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onHighlightPreview: function (ev) {
        this.view.highlight(ev.data.node);
    },
    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onNodeExpanded: function (ev) {
        this.view.selectNode(ev.data.node);
    },
    /**
     * @private
     */
    _onIframeReady: function () {
        this._resolveEditorIframeDef();
    },
    /**
     * @override
     */
    _onNodeClicked: function (ev) {
        var node = ev.data.node;

        if (node) {
            var currentNode = node;
            var sidebarNodes = [];
            while (currentNode) {
                sidebarNodes.push({
                    node: currentNode,
                    context: this.view.getNodeContext(currentNode),
                });
                currentNode = currentNode.parent;
            }
            this.sidebar.state = {
                mode: 'properties',
                nodes: sidebarNodes,
            };
        } else {
            this.sidebar.state = {
                mode: 'new',
            };
        }
        // TODO: this should probably not be done like that (setting state on
        // sidebar) but pass paramaters to _updateSidebar instead.
        this._updateSidebar();
    },
    /**
     * @private
     */
    _onPagerChanged: async function (ev) {
        const { currentMinimum, limit } = ev.data;
        this._cleanOperationsStack();
        this.env.currentId = this.env.ids[currentMinimum - 1];
        // TODO: maybe we should trigger_up and the action should handle
        // this? But the pager will be reinstantiate and useless RPCs will
        // be done (see willStart)
        // OR should we put _getReportViews of report_editor_action here?
        // But then it should be mocked in tests?
        const result = await this._getReportViews();
        this.pager.update({ currentMinimum, limit });
        this.reportHTML = result.report_html;
        this.reportViews = result.views;
        this.updateEditor();
    },
    /**
     * @private
     */
    _onPrintReport: function () {
        var self = this;
        this._rpc({
            route: '/web_studio/print_report',
            params: {
                record_id: this.env.currentId,
                report_name: this.reportName,
                context: session.user_context,
            },
        }).then(function (action) {
            self.do_action(action);
        });
    },
    /**
     * @override
     * @param {OdooEvent} ev
     * @param {Object} ev.data
     * @param {Object} ev.data.operation the operation sent to the server
     */
    _onViewChange: function (ev) {
        var self = this;
        var def;

        var node = ev.data.node || ev.data.targets[0].node;
        var operation = _.extend(ev.data.operation, {
            view_id: +node.attrs['data-oe-id'],
            xpath: node.attrs['data-oe-xpath'],
            context: node.context,
        });

        if (operation.type === 'add') {
            def = ev.data.component.add({
                targets: ev.data.targets,
            }).then(function (result) {
                // TODO: maybe modify the operation directly?
                _.extend(operation, result);
            });
        } else {
            if (node) {
                this.view.selectedNode = node;
            } else {
                console.warn("the key 'node' should be present");
            }
        }
        Promise.resolve(def).then(function () {
            return self._do(operation);
        }).guardedCatch(ev.data.fail);
    },
});

return ReportEditorManager;

});
