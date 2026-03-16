import { models } from '@web/../tests/web_test_helpers';

export class SaleOrderTemplate extends models.ServerModel {
    _name = 'sale.order.template';

    get_section_templates() {
        return [
            { id: 1, name: 'Sec1', source_order_id: [1, 'S00001'] },
            { id: 2, name: 'Sec2', source_order_id: [2, 'S00002'] },
            { id: 3, name: 'Sec3', source_order_id: [3, 'S00003'] },
            { id: 4, name: 'Sec4', source_order_id: [4, 'S00004'] },
        ];
    }
}
