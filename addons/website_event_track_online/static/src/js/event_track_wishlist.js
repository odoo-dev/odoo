odoo.define('website_event_track.website_event_track_wishlist', function (require) {
'use strict';

var core = require('web.core');
var _t = core._t;
var publicWidget = require('web.public.widget');

publicWidget.registry.websiteEventTrackWishlist = publicWidget.Widget.extend({
    selector: '.o_wetrack_js_wishlist',
    events: {
        'click i:not(.o_wishlist_locked)': '_onWishlistToggleClick',
    },

    /**
     * @override
     * @private
     */
    init: function () {
        this._super.apply(this, arguments);
        this._onWishlistToggleClick = _.debounce(this._onWishlistToggleClick, 500, true);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //-------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onWishlistToggleClick: function (ev) {
        ev.preventDefault();
        var self = this;
        var $trackStar = $(ev.target);
        if (this.wishlisted === undefined) {
            this.wishlisted = $trackStar.data('wishlisted');
        }

        this._rpc({
            route: '/event/track/toggle_wishlist',
            params: {
                track_id: $trackStar.data('trackId'),
                set_wishlisted: !this.wishlisted
            },
        }).then(function (result) {
            if (result.error && result.error === 'ignored') {
                self.displayNotification({
                    type: 'info',
                    title: _t('Please login'),
                    message: _.str.sprintf(_t('Unknown issue, please retry')),
                });
            } else if (result.wishlisted) {
                self.wishlisted = true;
                $trackStar.addClass('fa-star').removeClass('fa-star-o');
            } else {
                self.wishlisted = false;
                $trackStar.addClass('fa-star-o').removeClass('fa-star');
            }
        });
    },
});

return publicWidget.registry.websiteEventTrackWishlist;

});
