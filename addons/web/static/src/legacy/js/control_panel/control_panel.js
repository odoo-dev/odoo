odoo.define('web.ControlPanel', function (require) {
    "use strict";

    const ActionMenus = require('web.ActionMenus');
    const ComparisonMenu = require('web.ComparisonMenu');
    const ActionModel = require('web.ActionModel');
    const FavoriteMenu = require('web.FavoriteMenu');
    const FilterMenu = require('web.FilterMenu');
    const GroupByMenu = require('web.GroupByMenu');
    const Pager = require('web.Pager');
    const SearchBar = require('web.SearchBar');
    const { useModel } = require('web.Model');

    const { Component, onMounted, onPatched, onWillDestroy, onWillUpdateProps, useRef, useSubEnv } = owl;

    /**
     * TODO: remove this whole mechanism as soon as `cp_content` is completely removed.
     * Extract the 'cp_content' key of the given props and return them as well as
     * the extracted content.
     * @param {Object} props
     * @returns {Object}
     */
    function getAdditionalContent(props) {
        const additionalContent = {};
        if ('cp_content' in props) {
            const content = props.cp_content || {};
            if ('$buttons' in content) {
                additionalContent.buttons = content.$buttons;
            }
            if ('$searchview' in content) {
                additionalContent.searchView = content.$searchview;
            }
            if ('$pager' in content) {
                additionalContent.pager = content.$pager;
            }
            if ('$searchview_buttons' in content) {
                additionalContent.searchViewButtons = content.$searchview_buttons;
            }
        }
        return additionalContent;
    }

    /**
     * Control panel
     *
     * The control panel of the action|view. In its standard form, it is composed of
     * several sections/subcomponents. Here is a simplified graph representing the
     * action|view and its control panel:
     *
     * ┌ View Controller | Action ----------------------------------------------------------┐
     * | ┌ Control Panel ──────────────┬──────────────────────────────────────────────────┐ |
     * | │ ┌ Breadcrumbs ────────────┐ │ ┌ Search View ─────────────────────────────────┐ │ |
     * | │ │ [1] / [2]               │ │ │ [3] [ ================ 4 ================= ] │ │ |
     * | │ └─────────────────────────┘ │ └──────────────────────────────────────────────┘ │ |
     * | ├─────────────────────────────┼──────────────────────────────────────────────────┤ |
     * | │ ┌ Buttons ┐ ┌ ActionMenus ┐ │ ┌ Search Menus ─────┐ ┌ Pager ┐┌ View switcher ┐ │ |
     * | │ │ [5]     │ │ [6]         │ │ │ [7] [8] [9] [10]  │ │ [11]  ││ [12]          │ │ |
     * | │ └─────────┘ └─────────────┘ │ └───────────────────┘ └───────┘└───────────────┘ │ |
     * | └─────────────────────────────┴──────────────────────────────────────────────────┘ |
     * | ┌ View Renderer | Action content ────────────────────────────────────────────────┐ |
     * | │                                                                                │ |
     * | │  ...                                                                           │ |
     * | │                                                                                │ |
     * | │                                                                                │ |
     * | │                                                                                │ |
     * | └────────────────────────────────────────────────────────────────────────────────┘ |
     * └------------------------------------------------------------------------------------┘
     *
     * 1. Breadcrumbs: list of links composed by the `props.breadcrumbs` collection.
     * 2. Title: the title of the action|view. Can be empty and will yield 'Unnamed'.
     * 3. Search facets: a collection of facet components generated by the `ControlPanelModel`
     *    and handled by the `SearchBar` component. @see SearchFacet
     * 4. SearchBar: @see SearchBar
     * 5. Buttons: section in which the action|controller is meant to inject its control
     *             buttons. The template provides a slot for this purpose.
     * 6. Action menus: @see ActionMenus
     * 7. Filter menu: @see FilterMenu
     * 8. Group by menu: @see GroupByMenu
     * 9. Comparison menu: @see ComparisonMenu
     * 10. Favorite menu: @see FavoriteMenu
     * 11. Pager: @see Pager
     * 12. View switcher buttons: list of buttons composed by the `props.views` collection.
     *
     * Subcomponents (especially in the [Search Menus] section) will call
     * the ControlPanelModel to get processed information about the current view|action.
     * @see ControlPanelModel for more details.
     *
     * Note: an additional temporary (and ugly) mechanic allows to inject a jQuery element
     * given in `props.cp_content` in a related section:
     *      $buttons -> [Buttons]
     *      $searchview -> [Search View]
     *      $searchview_buttons -> [Search Menus]
     *      $pager -> [Pager]
     * This system must be replaced by proper slot usage and the static template
     * inheritance mechanism when converting the views/actions.
     * @extends Component
     */
    class ControlPanel extends Component {
        setup() {
            this.additionalContent = getAdditionalContent(this.props);

            let subEnvView = this.props.view;
            useSubEnv({
                action: this.props.action,
                searchModel: this.props.searchModel,
                get view() {
                    return subEnvView;
                },
            });

            // Connect to the model
            // TODO: move this in enterprise whenever possible
            if (this.env.searchModel) {
                this.model = useModel('searchModel');
            }

            // Reference hooks
            this.contentRefs = {
                buttons: useRef('buttons'),
                pager: useRef('pager'),
                searchView: useRef('searchView'),
                searchViewButtons: useRef('searchViewButtons'),
            };

            this.fields = this._formatFields(this.props.fields);

            this.sprintf = _.str.sprintf;

            onWillDestroy(() => {
                const content = this.props.cp_content;
                if (content) {
                    if (content.$buttons) {
                        content.$buttons.remove();
                    }
                    if (content.$searchview) {
                        content.$searchview.remove();
                    }
                    if (content.$pager) {
                        content.$pager.remove();
                    }
                    if (content.$searchview_buttons) {
                        content.$searchview_buttons.remove();
                    }
                }
            });

            // Cannot use useEffect. See prepareForFinish in owl_compatibility.js
            onMounted(() => this._attachAdditionalContent());
            onPatched(() => this._attachAdditionalContent());
            onWillUpdateProps((nextProps) => {
                // Note: action and searchModel are not likely to change during
                // the lifespan of a ControlPanel instance, so we only need to update
                // the view information.
                if ("view" in nextProps) {
                    subEnvView = nextProps.view;
                }
                if ("fields" in nextProps) {
                    this.fields = this._formatFields(nextProps.fields);
                }
                this.additionalContent = getAdditionalContent(nextProps);
            });
        }

        //---------------------------------------------------------------------
        // Private
        //---------------------------------------------------------------------

        /**
         * Attach additional content extracted from the props 'cp_content' key, if any.
         * @private
         */
        _attachAdditionalContent() {
            for (const key in this.additionalContent) {
                if (this.additionalContent[key] && this.additionalContent[key].length) {
                    const target = this.contentRefs[key].el;
                    if (target) {
                        target.innerHTML = "";
                        target.append(...this.additionalContent[key]);
                    }
                }
            }
        }

        /**
         * Give `name` and `description` keys to the fields given to the control
         * panel.
         * @private
         * @param {Object} fields
         * @returns {Object}
         */
        _formatFields(fields) {
            const formattedFields = {};
            for (const fieldName in fields) {
                formattedFields[fieldName] = Object.assign({
                    description: fields[fieldName].string,
                    name: fieldName,
                }, fields[fieldName]);
            }
            return formattedFields;
        }
    }
    ControlPanel.modelExtension = "ControlPanel";

    ControlPanel.components = {
        SearchBar,
        ActionMenus, Pager,
        ComparisonMenu, FilterMenu, GroupByMenu, FavoriteMenu,
    };
    ControlPanel.defaultProps = {
        breadcrumbs: [],
        fields: {},
        searchMenuTypes: [],
        views: [],
        withBreadcrumbs: true,
        withSearchBar: true,
    };
    ControlPanel.props = {
        action: Object,
        breadcrumbs: { type: Array, optional: true },
        searchModel: ActionModel,
        cp_content: { type: Object, optional: 1 },
        fields: { type: Object, optional: true },
        pager: { validate: p => typeof p === 'object' || p === null, optional: 1 },
        searchMenuTypes: { type: Array, optional: true },
        actionMenus: { validate: s => typeof s === 'object' || s === null, optional: 1 },
        title: { type: String, optional: 1 },
        view: { type: Object, optional: 1 },
        views: { type: Array, optional: true },
        withBreadcrumbs: { type: Boolean, optional: true },
        withSearchBar: { type: Boolean, optional: true },
    };
    ControlPanel.template = 'web.Legacy.ControlPanel';

    return ControlPanel;
});
