odoo.define('website_event_exhibitor.event_exhibitor', function (require) {
'use strict';

var publicWidget = require('web.public.widget');
var core = require('web.core');
var QWeb = core.qweb;

var Filter = require('website.search');

class Sponsor {

    /**
     * Constructor of `Sponsor`
     * @param {HTMLElement} dom 
     */
    constructor (dom) {
        this.dom = dom;
    }

    /**
     * Retrieve the data of the element
     */
    getData () {
        var $image = this.dom.find('img');
        var $title = this.dom.find('.card-title span:first-child');
        var $group = this.dom.closest('.o_wesponsor_category');
        return {
            'country': $image.attr('alt').trim(),
            'title': $title.text().trim(),
            'level': $group.find('h2').text().trim()
        };
    }

    /**
     * Display the element
     */
    show () {
        this.dom.parent().show();
    }   
    
    /**
     * Hide the element
     */
    hide () {
        this.dom.parent().hide();
    }
}

publicWidget.registry.eventExhibitor = publicWidget.Widget.extend({
    
    selector: '.o_wesponsor_index',
    xmlDependencies: ['/website_event_exhibitor/static/src/xml/event_search.xml'],
    events: {
        'input #event_exhibitor_search': '_onSearch',
        'click .dropdown-menu a': '_onAddFilter',
        'click .o_wesponsor_search_tag a': '_onRemoveFilter'
    },
    
    start: function () {

        var filter = new Filter();
        this.$el.find(".o_wesponsor_card").each(function () {
            filter.add(new Sponsor($(this)));
        });

        this.filter = filter;
        this.map = {};
    },

    /**
     * 
     * @param {String} group 
     * @param {Function} fun
     */
    addFilter: function (group, fun) {
        this.map[group] = fun;
        this.updateFilter();
    },

    /**
     * 
     * @param {String} group 
     */
    removeFilter: function (group) {
        delete this.map[group];
        this.updateFilter();
    },

    /**
     * Update the filter
     */
    updateFilter: function () {
        var gate = ['&', ...Object.values(this.map)];
        this.filter.apply(gate);
        var summary = this.$el.find('#search_summary');
        if (gate.length > 1) {
            summary.find('span').text(this.filter.count());
            summary.toggleClass('invisible', false);
        } else {
            summary.toggleClass('invisible', true);
        }
    },

    /**
     * 
     * @param {String} group - Group
     * @param {String} value - Value
     */
    renderTag: function (group, value) {
        return QWeb.render('event_search_tag', {
            group: group,
            value: value
        });
    },

    /**
     * 
     * @param {String} group 
     * @param {String} value 
     */
    addTag: function (group, value) {

        this.removeTag(group);
        
        var $container = this.$el.find('.o_wesponsor_active_search_tags');
        var $tag = this.renderTag(group, value);
        $container.append($tag);

        switch (group) {
            case 'country':
                this.addFilter('country', function (sponsor) {
                    var data = sponsor.getData();
                    return data.country === value;
                });
                break;
            case 'level':
                this.addFilter('level', function (sponsor) {
                    var data = sponsor.getData();
                    return data.level === value;
                });
                break;
        };

        this.addActive(group, value);
    },

    /**
     * 
     * @param {String} group 
     */
    removeTag: function (group) {
        var $container = this.$el.find('.o_wesponsor_active_search_tags');
        $container.find('span[data-group="' + group + '"]').each(function () {
            $(this).remove();
        });
        this.removeFilter(group);
        this.removeActive(group);
    },

    /**
     * 
     * @param {String} group 
     * @param {String} value 
     */
    addActive: function (group, value) {
        var selector = '.dropdown-menu[data-group="' + group + '"] a[data-value="' + value + '"]';
        this.$el.find(selector).each(function () {
            $(this).addClass('active');
        });
    },

    /**
     * 
     * @param {String} group 
     */
    removeActive: function (group) {
        var selector = '.dropdown-menu[data-group="' + group + '"] a.active';
        this.$el.find(selector).each(function () {
            $(this).removeClass('active');
        });
    },

    // Listeners:

    /**
     * 
     * @param {OdooEvent} event 
     */
    _onSearch: function (event) {
        
        event.preventDefault();
        
        var term = $(event.currentTarget).val();
        var pattern = new RegExp('(' + term + ')', 'gi');

        this.addFilter('search', function (sponsor) {
            var data = sponsor.getData();
            return pattern.test(data.title);
        });

        // Add the decorations:

        this.filter.forEachItem(function (sponsor) {

            var dom = sponsor.dom;
            var title = dom.find('.card-title span:first-child');
            var text = title.text();

            if (term.length === 0) {
                title.html(text);
            } else {
                title.html(text.replaceAll(pattern, '<mark>$1</mark>'));
            }
        });
    },

    /**
     * 
     * @param {OdooEvent} event 
     */
    _onAddFilter: function (event) {
        event.preventDefault();
        var $link = $(event.currentTarget);
        var group = $link.closest('.dropdown-menu').data('group');
        var value = $link.data('value');
        this.addTag(group, value);
    },

    /**
     * 
     * @param {OdooEvent} event 
     */
    _onRemoveFilter: function (event) {
        event.preventDefault();
        var $tag = $(event.currentTarget).parent();
        var group = $tag.data('group');
        this.removeTag(group);
    }
});

return {
    eventExhibitor: publicWidget.registry.eventExhibitor,
};
});
