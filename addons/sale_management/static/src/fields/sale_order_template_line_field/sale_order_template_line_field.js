import {
    SectionAndNoteFieldOne2Many,
    sectionAndNoteFieldOne2Many,
    SectionAndNoteListRenderer,
    getSectionRecords,
} from '@account/components/section_and_note_fields_backend/section_and_note_fields_backend';
import { x2ManyCommands } from '@web/core/orm_service';
import { registry } from '@web/core/registry';

export class SaleOrderTemplateLineListRenderer extends SectionAndNoteListRenderer {
    static recordRowTemplate = "sale_management.ListRenderer.RecordRow";

    getRowClass(record) {
        return super.getRowClass(record) + (record.data.is_optional ? ' text-primary' : '');
    }

    async toggleIsOptional(record) {
        const commands = [(x2ManyCommands.update(record.resId || record._virtualId, {
            is_optional: !record.data.is_optional,
        }))];

        for (const sectionRecord of getSectionRecords(this.props.list, record)) {
            let recordChanges = {}
            if(!record.data.is_optional) {
                recordChanges.product_uom_qty = 0;
            }
            recordChanges.is_optional = !record.data.is_optional;
            commands.push(x2ManyCommands.update(sectionRecord.resId || sectionRecord._virtualId, recordChanges));
        }
        await this.props.list.applyCommands(commands, { sort: true });
    }
}
export class SaleOrderTemplateLineOne2Many extends SectionAndNoteFieldOne2Many {
    static components = {
        ...super.components,
        ListRenderer: SaleOrderTemplateLineListRenderer,
    };
}

export const saleOrderTemplateLineOne2Many = {
    ...sectionAndNoteFieldOne2Many,
    component: SaleOrderTemplateLineOne2Many,
};

registry.category("fields").add("sol_template_lines_o2m", saleOrderTemplateLineOne2Many);
