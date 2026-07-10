import { RecipientsInput } from "@mail/core/web/recipients_input";
import { _t } from "@web/core/l10n/translation";
import { highlightText, odoomark } from "@web/core/utils/html";

import { patch } from "@web/core/utils/patch";

/**
 * In project sharing (this file only loads in project.webclient), restrict the
 * To-field autocomplete to collaborators and same-company contacts.
 * No partner creation from this field. Includes Search More like backend chatter.
 */
patch(RecipientsInput.prototype, {
    getAutoCompleteSources() {
        if (this.props.thread.model === "project.task") {
            return [
                {
                    placeholder: _t("Loading..."),
                    options: async (term) => {
                        const partnerIds = new Set(
                            this.getAllMailThreadRecipients()
                                .map((recipient) => recipient.partner_id)
                                .filter(Boolean)
                        );
                        const limit = 8;
                        const data = await this.orm.call(
                            "project.task",
                            "get_recipient_suggestions",
                            [this.props.thread.id],
                            { search: term, limit }
                        );
                        const allPartners = data["res.partner"] || [];
                        this.store.insert(data);
                        const partners = allPartners.filter(
                            (partner) => !partnerIds.has(partner.id)
                        );
                        const options = partners.map((partner) => ({
                            label: partner.display_name
                                ? highlightText(
                                      term,
                                      odoomark(
                                          partner.__formatted_display_name || partner.display_name
                                      ),
                                      "fw-bolder text-primary"
                                  )
                                : _t("Unnamed"),
                            onSelect: () => {
                                this.insertAdditionalRecipient({
                                    display_name: partner.display_name,
                                    email: partner.email,
                                    name: partner.name,
                                    partner_id: partner.id,
                                });
                            },
                        }));
                        if (allPartners.length >= limit) {
                            options.push({
                                label: _t("Search More..."),
                                cssClass:
                                    "o_m2o_dropdown_option o_m2o_dropdown_option_search_more",
                                onSelect: async () => {
                                    const allowedIds = await this.orm.call(
                                        "project.task",
                                        "get_allowed_recipient_partner_ids",
                                        [this.props.thread.id]
                                    );
                                    this.openListViewToSelectResPartner({
                                        domain: [
                                            ["id", "in", allowedIds],
                                            ["id", "not in", Array.from(partnerIds)],
                                        ],
                                        title: _t("Search: Recipients"),
                                    });
                                },
                            });
                        }
                        return options;
                    },
                },
            ];
        }
        return super.getAutoCompleteSources(...arguments);
    },
});
