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
            commands.push(x2ManyCommands.update(sectionRecord.resId || sectionRecord._virtualId, {
                is_optional: !record.data.is_optional,
                ...(!record.data.is_optional ? {
                    product_uom_qty: 0,
                    price_total: 0,
                    price_subtotal: 0,
                } : {}),
            }));
        }
        await this.props.list.applyCommands(commands, { sort: true });
    },
});
