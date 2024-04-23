/** @odoo-module */

import { _t } from "@web/core/l10n/translation";
import { x2ManyCommands } from "@web/core/orm_service";
import { Dialog } from '@web/core/dialog/dialog';
import { useService } from "@web/core/utils/hooks";
import { registry } from "@web/core/registry";
import { parseInteger  } from "@web/views/fields/parsers";
import { getId } from "@web/model/relational_model/utils";
import { Component, useRef, onMounted } from "@odoo/owl";

export class GenerateDialog extends Component {
    setup() {
        this.size = 'md';
        if (this.props.type === 'serial') {
            this.title = _t("Generate Serials numbers");
        } else {
            this.title = _t("Import Lots");
        }

        this.nextSerial = useRef('nextSerial');
        this.nextSerialCount = useRef('nextSerialCount');
        this.keepLines = useRef('keepLines');
        this.lots = useRef('lots');
        this.orm = useService("orm");
        onMounted(() => {
            if (this.props.type === 'serial') {
                this.nextSerialCount.el.value = this.props.move.data.product_uom_qty || 2;
            }
        });
    }
    async _onGenerate() {
        let lines = this.props.move.data.move_line_ids;

        if (!this.keepLines.el.checked) {
            await lines._applyCommands(lines._currentIds.map((currentId) => [
                x2ManyCommands.DELETE,
                currentId,
            ]));
        }

        const count = parseInteger(this.nextSerialCount.el?.value || '0');
        const move_line_vals = await this.orm.call("stock.move", "action_generate_lot_line_vals", [
            {
                ...this.props.move.context,
                default_product_id: this.props.move.data.product_id[0],
                default_location_dest_id: this.props.move.data.location_dest_id[0],
                default_location_id: this.props.move.data.location_id[0],
                picking_type_id: this.props.move.data.picking_type_id[0],
                company_id: this.props.move.data.company_id[0],
            },
            this.props.type,
            this.nextSerial.el?.value,
            count,
            this.lots.el?.value,
        ]);

        const update_commands = [];
        for (let i = 0; i < lines._currentIds.length && move_line_vals.length > 0; i++) {
            const move_line = this.props.move.data.move_line_ids.records[i].data;
            const line_current_id = lines._currentIds[i];

            if (!move_line.lot_name) {
                update_commands.push([
                    x2ManyCommands.UPDATE,
                    line_current_id,
                    {
                        lot_id: move_line_vals[0].lot_id,
                        lot_name: move_line_vals[0].lot_name,
                        quantity: move_line_vals[0].quantity === 1 ? move_line.quantity : move_line_vals[0].quantity,
                    }
                ]);
                move_line_vals.shift();
            }
        }
        await lines._applyCommands(update_commands);

        const newlines = [];

        // create records directly from values to bypass onchanges
        for (const values of move_line_vals) {
            newlines.push(
                lines._createRecordDatapoint(values, {
                    mode: 'readonly',
                    virtualId: getId("virtual"),
                    manuallyAdded: false,
                })
            );
        }

        lines.records.push(...newlines);
        lines._commands.push(...newlines.map((record) => [
            x2ManyCommands.CREATE,
            record._virtualId,
        ]));
        lines._currentIds.push(...newlines.map((record) => record._virtualId));
        await lines._onUpdate();
        this.props.close();
    }
}

GenerateDialog.template = 'stock.generate_serial_dialog';
GenerateDialog.props = {
    type: { type: String },
    move: { type: Object },
    close: { type: Function },
};
GenerateDialog.components = { Dialog };

class GenerateSerials extends Component {
    static template = "stock.GenerateSerials";

    setup(){
        this.dialog = useService("dialog");
    }

    openDialog(ev){
        this.dialog.add(GenerateDialog, {
            move: this.props.record,
            type: 'serial',
        });
    }
}

class ImportLots extends Component {
    static template = "stock.ImportLots";

    setup(){
        this.dialog = useService("dialog");
    }

    openDialog(ev){
        this.dialog.add(GenerateDialog, {
            move: this.props.record,
            type: 'import',
        });
    }
}
registry.category("view_widgets").add("import_lots", {component: ImportLots});
registry.category("view_widgets").add("generate_serials", {component: GenerateSerials});
