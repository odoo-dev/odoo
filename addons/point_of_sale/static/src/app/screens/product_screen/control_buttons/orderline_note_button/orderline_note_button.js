import { _t } from "@web/core/l10n/translation";
import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { TextInputPopup } from "@point_of_sale/app/components/popups/text_input_popup/text_input_popup";
import { useService } from "@web/core/utils/hooks";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";

export class NoteButton extends Component {
    static template = "point_of_sale.NoteButton";
    static props = {
        icon: { type: String, optional: true },
        label: { type: String, optional: false },
        class: { type: String, optional: true },
    };

    setup() {
        this.pos = usePos();
        this.dialog = useService("dialog");
    }

    get selectedOrderline() {
        return this.pos.getOrder().getSelectedOrderline();
    }

    async onClick() {
        const selectedNote = this.currentNote || "";
        const payload = await this.openTextInput(selectedNote);
        if (this.selectedOrderline) {
            this.setChanges(this.selectedOrderline, payload);
        } else {
            this.pos.getOrder().setGeneralCustomerNote(payload);
        }
        return { confirmed: typeof payload === "string", inputNote: payload };
    }

    // Update line changes and set them
    async setChanges(selectedOrderline, payload) {
        var quantity_with_note = 0;
        const changes = this.pos.getOrderChanges();
        for (const key in changes.orderlines) {
            if (changes.orderlines[key].uuid == selectedOrderline.uuid) {
                quantity_with_note = changes.orderlines[key].quantity;
                break;
            }
        }
        const saved_quantity = selectedOrderline.qty - quantity_with_note;
        if (saved_quantity > 0 && quantity_with_note > 0) {
            await this.pos.addLineToCurrentOrder({
                product_tmpl_id: selectedOrderline.product_id.product_tmpl_id,
                qty: quantity_with_note,
                note: payload,
            });
            selectedOrderline.qty = saved_quantity;
        } else {
            this.setOrderlineNote(payload);
        }
    }

    async openTextInput(selectedNote) {
        let buttons = [];
        if (this.type === "internal" || this.pos.getOrder()?.getSelectedOrderline() === undefined) {
            buttons = this.pos.models["pos.note"].readAll().map((note) => ({
                label: note.name,
                class: note.color ? `o_colorlist_item_color_${note.color}` : "",
            }));
        }
        let titlePrefix = "";
        if (this.selectedOrderline) {
            titlePrefix = this.selectedOrderline.product_id.name + ": ";
        }
        return await makeAwaitable(this.dialog, TextInputPopup, {
            title: titlePrefix + _t("Add a %s", this.props.label),
            buttons,
            rows: 4,
            startingValue: selectedNote,
        });
    }

    get orderNote() {
        const order = this.pos.getOrder();
        return this.type === "internal"
            ? order.internal_note || ""
            : order.general_customer_note || "";
    }

    get orderlineNote() {
        const orderline = this.selectedOrderline;
        return this.type === "internal" ? orderline.getNote() : orderline.getCustomerNote();
    }

    get currentNote() {
        return this.selectedOrderline ? this.orderlineNote : this.orderNote;
    }
    get type() {
        return "customer";
    }
    setOrderlineNote(value) {
        return this.selectedOrderline.setCustomerNote(value);
    }
}
export class InternalNoteButton extends NoteButton {
    static template = "point_of_sale.NoteButton";

    // Useful to handle name and color together for internal notes
    reframeNotes(payload) {
        const notesArray = [];
        for (const noteName of payload.split("\n")) {
            if (noteName.trim()) {
                const defaultNote = this.pos.models["pos.note"].find(
                    (note) => note.name === noteName
                );
                notesArray.push({
                    text: noteName,
                    colorIndex: defaultNote ? defaultNote.color : 0,
                });
            }
        }
        return JSON.stringify(notesArray);
    }

    get type() {
        return "internal";
    }

    async onClick() {
        const selectedNote = JSON.parse(this.currentNote || "[]");
        const payload = await this.openTextInput(selectedNote.map((n) => n.text).join("\n"));
        const coloredNotes = payload ? this.reframeNotes(payload) : "[]";
        if (this.selectedOrderline) {
            this.setChanges(this.selectedOrderline, coloredNotes);
        } else {
            this.pos.getOrder().setInternalNote(coloredNotes);
        }
        return {
            confirmed: typeof payload === "string",
            inputNote: coloredNotes,
            oldNote: JSON.stringify(selectedNote),
        };
    }
    setOrderlineNote(value) {
        return this.selectedOrderline.setNote(value);
    }
}
