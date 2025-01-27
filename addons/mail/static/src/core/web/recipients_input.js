import { _t } from "@web/core/l10n/translation";
import { Component, useEffect, useState } from "@odoo/owl";
import { AutoComplete } from "@web/core/autocomplete/autocomplete";
import { TagsList } from "@web/core/tags_list/tags_list";
import { useOpenMany2XRecord, useSelectCreate } from "@web/views/fields/relational_utils";
import { useService } from "@web/core/utils/hooks";
import { isEmail } from "@web/core/utils/strings";

export class RecipientsInput extends Component {
    static template = "mail.RecipientsInput";
    static components = { AutoComplete, TagsList };
    static props = {
        thread: { type: Object },
    };

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            tags: this.getTagsFromThread(),
        });

        this.openFormViewToCreateResPartner = useOpenMany2XRecord({
            fieldString: _t("Additional Contact"),
            resModel: "res.partner",
            activeActions: {
                create: true,
            },
            /** @param {Record} partner */
            onRecordSaved: async (partner) => {
                this.props.thread.additionalRecipients.push({
                    id: partner.id,
                    email: partner.email,
                    name: partner.name,
                });
            },
        });

        this.openListViewToSelectResPartner = useSelectCreate({
            resModel: "res.partner",
            activeActions: {
                create: false,
                link: true, // Unable multi-select
            },
            /** @param {Object} resIds */
            onSelected: async (resIds) => {
                const partners = await this.orm.searchRead(
                    "res.partner",
                    [["id", "in", Array.from(resIds)]],
                    ["display_name", "email", "id", "name"]
                );
                for (const partner of partners) {
                    this.props.thread.additionalRecipients.push({
                        id: partner.id,
                        email: partner.email,
                        name: partner.name,
                    });
                }
            },
        });

        useEffect(
            () => {
                this.state.tags = this.getTagsFromThread();
            },
            () => [
                this.props.thread.suggestedRecipients,
                this.props.thread.suggestedRecipients.length,
                this.props.thread.additionalRecipients,
                this.props.thread.additionalRecipients.length,
            ]
        );
    }

    getAutoCompleteSources() {
        return [
            {
                placeholder: _t("Loading..."),
                /** @param {string} term */
                options: async (term) => {
                    const partnerIds = new Set();
                    for (const recipient of this.props.thread.suggestedRecipients) {
                        partnerIds.add(recipient.partner_id);
                    }
                    for (const recipient of this.props.thread.additionalRecipients) {
                        partnerIds.add(recipient.id);
                    }
                    const partners = await this.orm.searchRead(
                        "res.partner",
                        [
                            ["id", "not in", Array.from(partnerIds)],
                            ["name", "ilike", term],
                        ],
                        ["display_name", "email", "id", "name"],
                        { limit: 10 }
                    );
                    return partners.map((partner) => ({
                        id: partner.id,
                        label: partner.display_name,
                        onSelectOption: () => {
                            this.props.thread.additionalRecipients.push({
                                id: partner.id,
                                email: partner.email,
                                name: partner.name,
                            });
                        },
                    }));
                },
            },
            {
                /** @param {string} term */
                options: (term) => [
                    {
                        label: _t("Search More..."),
                        classList: "o_m2o_dropdown_option o_m2o_dropdown_option_search_more",
                        onSelectOption: () => {
                            this.openListViewToSelectResPartner({});
                        },
                    },
                ],
            },
            {
                /** @param {string} term */
                options: (term) => {
                    if (!term) {
                        return [];
                    }
                    return [
                        {
                            label: _t("Create and edit..."),
                            classList: "o_m2o_dropdown_option o_m2o_dropdown_option_create_edit",
                            onSelectOption: () => {
                                const context = {
                                    form_view_ref: "base.view_partner_simple_form",
                                    default_name: term,
                                };
                                if (isEmail(term)) {
                                    context.default_email = term;
                                }
                                this.openFormViewToCreateResPartner({ context });
                            },
                        },
                    ];
                },
            },
        ];
    }

    /** @returns {Object} */
    getTagsFromThread() {
        const tags = [];
        for (const recipient of this.props.thread.suggestedRecipients) {
            tags.push({
                id: recipient.partner_id,
                text: recipient.name,
                onDelete: () => {
                    this.props.thread.suggestedRecipients =
                        this.props.thread.suggestedRecipients.filter(
                            (suggestedRecipient) =>
                                suggestedRecipient.partner_id !== recipient.partner_id
                        );
                },
            });
        }
        for (const recipient of this.props.thread.additionalRecipients) {
            tags.push({
                id: recipient.id,
                text: recipient.name,
                onDelete: () => {
                    this.props.thread.additionalRecipients =
                        this.props.thread.additionalRecipients.filter(
                            (additionalRecipient) => additionalRecipient.id !== recipient.id
                        );
                },
            });
        }
        return tags;
    }

    /** @returns {string} */
    getPlaceholder() {
        const hasRecipients =
            this.props.thread.suggestedRecipients.length ||
            this.props.thread.additionalRecipients.length;
        return hasRecipients ? "" : _t("Followers only");
    }

    /** @param {Object} option */
    onSelect(option) {
        // TODO JBN: Why do they wrap the object in `makeOption` in `AutoComplete` ?
        const options = Object.getPrototypeOf(option);
        options.onSelectOption?.();
    }
}
