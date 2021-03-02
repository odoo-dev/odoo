odoo.define('web_studio.EditorMixin', function() {
"use strict";

return {
    /**
     * Find and return the first node found in the view arch
     * satifying the given node description.
     * Breadth-first search.
     * @param {Object} viewArch
     * @param {Object} nodeDescription
     * @param {string} nodeDescription.tag
     * @param {Object} nodeDescription.attrs
     * @returns {Object}
     */
    findNode: function (viewArch, nodeDescription) {
        // TODO transparently check t-att- attributes ?
        // TODO support modifiers objects ?
        const nodesToCheck = [viewArch];
        while (nodesToCheck.length > 0) {
            const node = nodesToCheck.shift();
            const match = this._satisfiesNodeDescription(node, nodeDescription);
            if (match) return node;
            nodesToCheck.push(...(node.children || []));
        }
    },
    /**
     * Handles the drag and drop of a jQuery UI element.
     *
     * @param {JQuery} $drag
     * @param {Object} node
     * @param {string} position
     */
    handleDrop: function ($drag, node, position) {
        var isNew = $drag.hasClass('o_web_studio_component');
        var values;
        if (isNew) {
            values = {
                type: 'add',
                structure: $drag.data('structure'),
                field_description: $drag.data('field_description'),
                node: node,
                new_attrs: $drag.data('new_attrs'),
                position: position,
            };
        } else {
            var movedFieldName = $drag.data('name');
            if (node.attrs.name === movedFieldName) {
                // the field is dropped on itself
                return;
            }
            values = {
                type: 'move',
                node: node,
                position: position,
                structure: 'field',
                new_attrs: {
                    name: movedFieldName,
                },
            };
        }
        this.trigger_up('on_hook_selected');
        this.trigger_up('view_change', values);
    },
    /**
     * Highlight the nearest hook regarding the position and remove the
     * highlighto on other elements.
     *
     * @param {JQuery} $helper - the helper being dragged
     * @param {Object} position - {pageX: x, pageY: y}
     */
    highlightNearestHook: function ($helper, position) {
        this.$('.o_web_studio_nearest_hook').removeClass('o_web_studio_nearest_hook');
        // to be implemented by each editor
    },
    /*
     * Set the style and the corresponding event on a selectable node (fields,
     * groups, etc.) of the editor
     */
    setSelectable: function ($el) {
        var self = this;
        $el.click(function () {
            self.unselectedElements();
            $(this).addClass('o_web_studio_clicked');
        })
        .mouseover(function () {
            if (self.$('.ui-draggable-dragging').length) {
                return;
            }
            $(this).addClass('o_web_studio_hovered');
        })
        .mouseout(function () {
            $(this).removeClass('o_web_studio_hovered');
        });
    },
    unselectedElements: function () {
        this.selected_node_id = false;
        var $el = this.$('.o_web_studio_clicked');
        $el.removeClass('o_web_studio_clicked');
        if ($el.find('.blockUI')) {
            $el.find('.blockUI').parent().unblock();
        }
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Check if the node satifies the given node description
     * @param {Object} node
     * @param {Object} nodeDescription
     * @param {Object} nodeDescription.attrs
     * @param {string} nodeDescription.tag
     * @returns {boolean}
     */
    _satisfiesNodeDescription: function (node, nodeDescription) {
        const attrs = Object.assign({}, nodeDescription);
        const tag = attrs.tag;
        delete attrs.tag;
        const checkAttrs = Object.keys(attrs).length !== 0;
        if (tag && tag !== node.tag) return false;
        if (tag && !checkAttrs) return true;
        const match = (a1, a2) => typeof(a1) === 'string' ? a1.includes(a2) : a1 === a2;
        const matchedAttrs = Object
            .entries(attrs)
            .filter(([attr, value]) => match(node.attrs[attr], value))
            .map(([attr, value]) => attr);
        return matchedAttrs.length > 0 && matchedAttrs.length === Object.keys(attrs).length;
    },
};

});
