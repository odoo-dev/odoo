import { Dropdown } from "@web/core/dropdown/dropdown";
import { Component } from "@odoo/owl";

export class ForecastedWarehouseFilter extends Component {
    static template = "stock.ForecastedWarehouseFilter";
    static components = { Dropdown };
    static props = { action: Object, setWarehouseInContext: Function, warehouses: Array };

    setup() {
        this.context = this.props.action.context;
        this.warehouses = this.props.warehouses;
    }

    _onSelected(id){
        this.props.setWarehouseInContext(Number(id));
    }

    get activeWarehouse() {
        return warehouse = this.context.warehouse_id
            ? this.warehouses.find((w) => w.id == this.context.warehouse_id)
            : this.warehouses[0];
    }

    get warehousesItems() {
        return this.warehouses.map((warehouse) => ({
            id: warehouse.id,
            label: warehouse.name,
            onSelected: () => this._onSelected(warehouse.id),
        }));
    }
}
