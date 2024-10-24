import { _t } from "@web/core/l10n/translation";
import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { TextInputPopup } from "@point_of_sale/app/utils/input_popups/text_input_popup";
import { useService } from "@web/core/utils/hooks";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";

export class NoteButton extends Component {
    static template = "point_of_sale.NoteButton";
    static props = {
        icon: { type: String, optional: true },
        label: { type: String, optional: false },
        getter: { type: Function, optional: false },
        setter: { type: Function, optional: false },
        class: { type: String, optional: true },
    };

    setup() {
        this.pos = usePos();
        this.dialog = useService("dialog");
    }
    onClick() {
        return this.pos.get_order()?.get_selected_orderline()
            ? this.addLineNotes()
            : this.addGeneralNote();
    }
    async addLineNotes() {
        const selectedOrderline = this.pos.get_order().get_selected_orderline();
        const selectedNote = this.props.getter(selectedOrderline) || "";
        const oldNote = selectedOrderline.getNote();
        const payload = await this.openTextInput(selectedNote);
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
            this.props.setter(selectedOrderline, payload);
        }
        return { confirmed: typeof payload === "string", inputNote: payload, oldNote };
    }
    async addGeneralNote() {
        const selectedOrder = this.pos.get_order();
        const selectedNote = this.props.getter(selectedOrder) || "";
        const payload = await this.openTextInput(selectedNote);
        this.props.setter(selectedOrder, payload);
        return { confirmed: typeof payload === "string", inputNote: payload };
    }
    async openTextInput(selectedNote) {
        let buttons = [];
        if (
            this._isInternalNote() ||
            this.pos.get_order()?.get_selected_orderline() === undefined
        ) {
            buttons = this.pos.models["pos.note"].getAll().map((note) => ({
                label: note.name,
                isSelected: selectedNote.split("\n").includes(note.name), // Check if the note is already selected
            }));
        }
        return await makeAwaitable(this.dialog, TextInputPopup, {
            title: _t("Add %s", this.props.label),
            buttons,
            rows: 4,
            startingValue: selectedNote,
        });
    }
    _isInternalNote() {
        if (this.pos.config.module_pos_restaurant) {
            return this.props.label == _t("Kitchen Note");
        }
        return this.props.label == _t("Internal Note");
    }
}
