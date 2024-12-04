import publicWidget from "@web/legacy/js/public/public_widget";
import { renderToElement } from "@web/core/utils/render";

publicWidget.registry.websiteForumSpam = publicWidget.Widget.extend({
    selector: '.o_wforum_moderation_queue',
    events: {
        'click .o_wforum_select_all_spam': '_onSelectallSpamClick',
        'click .o_wforum_mark_spam': 'async _onMarkSpamClick',
        'input #spamSearch': '_onSpamSearchInput',
    },

    init() {
        this._super(...arguments);
        this.orm = this.bindService("orm");
    },

    /**
     * @override
     */
    start: function () {
        this.spamIDs = this.$('.modal').data('spam-ids');
        return this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onSelectallSpamClick: function (ev) {
        var $spamInput = this.$('.modal .tab-pane.active input');
        $spamInput.prop('checked', true);
    },

    /**
     * @private
     * @param {Event} ev
     */
    _onSpamSearchInput: function (ev) {
        var self = this;
        var toSearch = $(ev.currentTarget).val();
        return this.orm.searchRead(
            "forum.post",
            [['id', 'in', self.spamIDs],
                '|',
                ['name', 'ilike', toSearch],
                ['content', 'ilike', toSearch]],
            ['name', 'content']
        ).then(function (o) {
            Object.values(o).forEach((r) => {
                r.content = $('<p>' + $(r.content).html() + '</p>').text().substring(0, 250);
            });
            self.$('div.post_spam').empty().append(renderToElement('website_forum.spam_search_name', {
                posts: o,
            }));
        });
    },

    /**
     * @private
     * @param {Event} ev
     */
    _onMarkSpamClick: function (ev) {
        var key = this.$('.modal .tab-pane.active').data('key');
        var $inputs = this.$('.modal .tab-pane.active input.form-check-input:checked');
        var values = Array.from($inputs).map((o) => parseInt(o.value));
        return this.orm.call("forum.post", "mark_as_offensive_batch", [
            this.spamIDs,
            key,
            values,
        ]).then(function () {
            window.location.reload();
        });
    },
});
