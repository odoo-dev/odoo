import { patch } from '@web/core/utils/patch';
import { SaleOrderLineListRenderer } from '@sale/js/sale_order_line_field/sale_order_line_field'; 
import { x2ManyCommands } from '@web/core/orm_service';
import { getSectionRecords } from '@account/components/section_and_note_fields_backend/section_and_note_fields_backend';

patch(SaleOrderLineListRenderer.prototype, {
    getRowClass(record) {
        return super.getRowClass(record) + (record.data.is_optional ? ' text-primary' : '');
    },

    async toggleIsOptional(record) {
        const commands = [(x2ManyCommands.update(record.resId || record._virtualId, {
            is_optional: !record.data.is_optional,
        }))];

        for (const sectionRecord of getSectionRecords(this.props.list, record)) {
            let recordChanges = {}
            if(!record.data.is_optional) {
                recordChanges.product_uom_qty = 0;
                recordChanges.price_total = 0;
                recordChanges.price_subtotal = 0;
            }
            recordChanges.is_optional = !record.data.is_optional;
            commands.push(x2ManyCommands.update(sectionRecord.resId || sectionRecord._virtualId, recordChanges));
        }

        await this.props.list.applyCommands(commands, { sort: true });
    },
});
