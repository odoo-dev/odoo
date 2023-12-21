/** @odoo-module **/

import publicWidget from 'web.public.widget';
import DynamicSnippet from 'website.s_dynamic_snippet';

const DynamicSnippetEvents = DynamicSnippet.extend({
    // While the selector has 'upcoming_snippet' in its name, it now has a filter
    // option to include ongoing events. The name is kept for backward compatibility.
    selector: '.s_event_upcoming_snippet',
    disabledInEditableMode: false,

    /**
     * @override
     * @private
     */
    _getSearchDomain: function () {
        const searchDomain = this._super.apply(this, arguments);
        const filterByTagIds = JSON.parse(this.$el.get(0).dataset.filterByTagIds || '[]');
        if (filterByTagIds.length > 0) {
            searchDomain.concat(Array(filterByTagIds.length-1).fill('&'));
            for (const tag of filterByTagIds) {
                searchDomain.push(['tag_ids', 'in', tag]);
            }
        }
        return searchDomain;
    }

});

publicWidget.registry.events = DynamicSnippetEvents;
