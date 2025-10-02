import { patch } from "@web/core/utils/patch";
import { patchDynamicContent } from '@web/public/utils';
import { TicketDetails } from "@website_event/interactions/website_event_ticket_details";


patch(TicketDetails.prototype, {
    setup() {
        super.setup();
        patchDynamicContent(this.dynamicContent, {
            ".o_wevent_combo_item_product": { 't-on-click': this.onComboItemProductClick.bind(this) },
            ".a-submit": {
                "t-on-click.prevent.stop": this.onSubmitClick.bind(this),
                "t-att-disabled": () => this.noTicketsOrdered || this.buttonDisabled || !this.allComboItemSelected ? "disabled" : false,
            },
        });
    },

    get allComboItemSelected() {
        const nbComboOptions = this.el.querySelectorAll(".o_wevent_combo:not(.d-none) > .o_wevent_combo_options")?.length;
        const nbComboOptionsSelected = this.el.querySelectorAll("article.selected")?.length;
        return nbComboOptions === nbComboOptionsSelected;
    },

    /**
     * @override
     */
    async onInput(ev) {
        super.onInput(ev);

        const ticketId = parseInt(ev.currentTarget.name.split('-')[1]);
        const comboOptionsEl = this.el.querySelector(`#ticket_combo_options_${ticketId}`);
        if (!comboOptionsEl) {
            return;
        }
        const comboQty = parseInt(ev.currentTarget.value);
        if (comboQty > 0) {
            comboOptionsEl.classList.remove('d-none');
        } else {
            comboOptionsEl.classList.add('d-none');
        }
    },

    onComboItemProductClick(ev) {
        const comboEl = ev.currentTarget.closest('div.o_wevent_sale_combo');
        comboEl.querySelector('article.selected')?.classList.remove('selected');
        ev.currentTarget.classList.add('selected');

        const comboId = comboEl.getAttribute('name').split('-')[1];
        const ticketId = parseInt(ev.currentTarget.dataset.ticketId);
        const comboItemId = parseInt(ev.currentTarget.dataset.comboItemId);
        this.el.querySelector(`input[name='choice_combo-${ticketId}.${comboId}']`).value = comboItemId;

    },
});
