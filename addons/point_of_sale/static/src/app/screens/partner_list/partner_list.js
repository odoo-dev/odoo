/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { debounce } from "@web/core/utils/timing";
import { useService } from "@web/core/utils/hooks";
import { useAsyncLockedMethod } from "@point_of_sale/app/utils/hooks";
import { session } from "@web/session";
import { fuzzyLookup } from "@web/core/utils/search";

import { PartnerLine } from "@point_of_sale/app/screens/partner_list/partner_line/partner_line";
import { PartnerDetailsEdit } from "@point_of_sale/app/screens/partner_list/partner_editor/partner_editor";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { Component, onWillUnmount, useRef, useState } from "@odoo/owl";

/**
 * Render this screen using `showTempScreen` to select partner.
 * When the shown screen is confirmed ('Set Customer' or 'Deselect Customer'
 * button is clicked), the call to `showTempScreen` resolves to the
 * selected partner. E.g.
 *
 * ```js
 * const { confirmed, payload: selectedPartner } = await showTempScreen('PartnerListScreen');
 * if (confirmed) {
 *   // do something with the selectedPartner
 * }
 * ```
 *
 * @props partner - originally selected partner
 */
export class PartnerListScreen extends Component {
    static components = { PartnerDetailsEdit, PartnerLine };
    static template = "point_of_sale.PartnerListScreen";

    setup() {
        this.pos = usePos();
        this.ui = useState(useService("ui"));
        this.orm = useService("orm");
        this.notification = useService("pos_notification");
        this.searchWordInputRef = useRef("search-word-input-partner");

        this.state = useState({
            query: null,
            selectedPartner: this.props.partner,
            detailIsShown: this.props.editModeProps ? true : false,
            editModeProps: {
                partner: this.props.editModeProps ? this.props.partner : null,
                missingFields: this.props.missingFields ? this.props.missingFields : null,
            },
            previousQuery: "",
            currentOffset: 0,
        });
        this.updatePartnerList = debounce(this.updatePartnerList, 70);
        this.saveChanges = useAsyncLockedMethod(this.saveChanges);
        onWillUnmount(this.updatePartnerList.cancel);
        this.partnerEditor = {}; // create an imperative handle for PartnerDetailsEdit
    }
    // Lifecycle hooks
    back(force = false) {
        if (this.state.detailIsShown && !force) {
            this.state.detailIsShown = false;
        } else {
            this.props.resolve({ confirmed: false, payload: false });
            this.pos.closeTempScreen();
        }
    }

    goToOrders() {
        this.back(true);
        const partner = this.state.editModeProps.partner;
        const partnerHasActiveOrders = this.pos
            .get_order_list()
            .some((order) => order.partner?.id === partner.id);
        const ui = {
            searchDetails: {
                fieldName: "PARTNER",
                searchTerm: partner.name,
            },
            filter: partnerHasActiveOrders ? "" : "SYNCED",
        };
        this.pos.showScreen("TicketScreen", { ui });
    }

    confirm() {
        this.props.resolve({ confirmed: true, payload: this.state.selectedPartner });
        this.pos.closeTempScreen();
    }
    activateEditMode() {
        this.state.detailIsShown = true;
    }
    // Getters

    get_partners_sorted(max_count) {
        const partners = [];

        max_count = max_count
            ? Math.min(this.pos.res_partner.length, max_count)
            : this.pos.res_partner.length;

        for (var i = 0; i < max_count; i++) {
            partners.push(this.pos.indexed.res_partner.id[this.pos.res_partner[i].id]);
        }

        return partners;
    }

    partner_search_string(partner) {
        var str = partner.name || "";
        if (partner.barcode) {
            str += "|" + partner.barcode;
        }
        if (partner.address) {
            str += "|" + partner.address;
        }
        if (partner.phone) {
            str += "|" + partner.phone.split(" ").join("");
        }
        if (partner.mobile) {
            str += "|" + partner.mobile.split(" ").join("");
        }
        if (partner.email) {
            str += "|" + partner.email;
        }
        if (partner.vat) {
            str += "|" + partner.vat;
        }
        if (partner.parent_name) {
            str += "|" + partner.parent_name;
        }
        str = "" + partner.id + ":" + str.replace(":", "").replace(/\n/g, " ") + "\n";
        return str;
    }

    get_partners_searched() {
        return fuzzyLookup(this.state.query.trim(), this.pos.res_partner, (partner) =>
            this.partner_search_string(partner)
        );
    }

    get currentOrder() {
        return this.pos.get_order();
    }

    get partners() {
        let res;
        if (this.state.query && this.state.query.trim() !== "") {
            res = this.get_partners_searched();
        } else {
            res = this.get_partners_sorted(1000);
        }
        res.sort(function (a, b) {
            return (a.name || "").localeCompare(b.name || "");
        });
        // the selected partner (if any) is displayed at the top of the list
        if (this.state.selectedPartner) {
            const indexOfSelectedPartner = res.findIndex(
                (partner) => partner.id === this.state.selectedPartner.id
            );
            if (indexOfSelectedPartner !== -1) {
                res.splice(indexOfSelectedPartner, 1);
            }
            res.unshift(this.state.selectedPartner);
        }
        return res;
    }
    get isBalanceDisplayed() {
        return false;
    }
    get partnerLink() {
        return `/web#model=res.partner&id=${this.state.editModeProps.partner.id}`;
    }

    // Methods

    async _onPressEnterKey() {
        if (!this.state.query) {
            return;
        }
        const result = await this.searchPartner();
        if (result.length > 0) {
            this.notification.add(
                _t('%s customer(s) found for "%s".', result.length, this.state.query),
                3000
            );
        } else {
            this.notification.add(_t('No more customer found for "%s".', this.state.query), 3000);
        }
    }
    _clearSearch() {
        this.searchWordInputRef.el.value = "";
        this.state.query = "";
    }
    // We declare this event handler as a debounce function in
    // order to lower its trigger rate.
    async updatePartnerList(event) {
        this.state.query = event.target.value;
    }
    clickPartner(partner) {
        if (this.state.selectedPartner && this.state.selectedPartner.id === partner.id) {
            this.state.selectedPartner = null;
        } else {
            this.state.selectedPartner = partner;
        }
        this.confirm();
    }
    editPartner(partner) {
        this.state.editModeProps.partner = partner;
        this.activateEditMode();
    }
    createPartner() {
        // initialize the edit screen with default details about country, state, and lang
        const company = this.pos.res_company;
        const country_id = company.country_id.id;
        const state_id = company.state_id.id;
        this.state.editModeProps.partner = {
            country_id,
            state_id,
            lang: session.user_context.lang,
        };
        this.activateEditMode();
    }
    async saveChanges(processedChanges) {
        const partnerId = await this.orm.call("res.partner", "create_from_ui", [processedChanges]);
        await this.pos.load_new_partners();
        this.state.selectedPartner = this.pos.db.get_partner_by_id(partnerId);
        this.confirm();
    }
    async searchPartner() {
        if (this.state.previousQuery != this.state.query) {
            this.state.currentOffset = 0;
        }
        const result = await this.getNewPartners();
        this.pos.addPartners(result);
        if (this.state.previousQuery == this.state.query) {
            this.state.currentOffset += result.length;
        } else {
            this.state.previousQuery = this.state.query;
            this.state.currentOffset = result.length;
        }
        return result;
    }
    async getNewPartners() {
        let domain = [];
        const limit = 30;
        if (this.state.query) {
            const search_fields = ["name", "parent_name", "phone_mobile_search", "email"];
            domain = [
                ...Array(search_fields.length - 1).fill("|"),
                ...search_fields.map((field) => [field, "ilike", this.state.query + "%"]),
            ];
        }
        // FIXME POSREF timeout
        const result = await this.orm.silent.call(
            "pos.session",
            "get_pos_ui_res_partner_by_params",
            [[odoo.pos_session_id], { domain, limit: limit, offset: this.state.currentOffset }]
        );
        return result;
    }
}

registry.category("pos_screens").add("PartnerListScreen", PartnerListScreen);
