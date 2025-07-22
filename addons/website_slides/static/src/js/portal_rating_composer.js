import RatingPopupComposer from "@portal_rating/js/portal_rating_composer";

RatingPopupComposer.include({
    willStart: function (parent) {
        const def = this._super.apply(this, arguments);
        const ondeleteMessage = ({ detail }) => {
            this.options = Object.assign(this.options, detail);
            this.rating_avg = Math.round(detail["rating_avg"] * 100) / 100 || 0.0;
            this.rating_count = detail["rating_count"] || 0.0;
            this._reloadRatingPopupComposer();
        };
        this.target.addEventListener("deleteMessageEvent", ondeleteMessage);
        this.removeListener = () => {
            this.target.removeEventListener("deleteMessageEvent", ondeleteMessage);
        };

        return def;
    },

    _update_options: function (data) {
        this._super(...arguments);
        this.options.force_submit_url =
            data.force_submit_url ||
            (this.options.default_message_id && "/slides/mail/update_comment");
    },

    /**
     * @override
     */
    destroy: function () {
        this._super.apply(this, arguments);
        this.removeListener();
    },
});
