import { Component, useState } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { Input } from "@point_of_sale/app/components/inputs/input/input";
import { useService } from "@web/core/utils/hooks";

/**
 * All cells used in the PosListView should use these props.
 */
export const cellProps = {
    record: { type: Object },
    classes: { type: Object, optional: true },
    close: { type: Function, optional: true }, // In case of popup
};

/**
 * A generic list view to display records in a table or a list (for mobile).
 * Each field can be either a char or a component. If a component, it must
 * use the `cellProps` defined above.
 *
 * The possibility of using components as cells allows to have complex
 * rendering logic inside the cells.
 *
 * Props:
 * - fields: Array of fields to display. Each field is an object with:
 *      - type: "char" | "component" | "action"
 *      - label: string (for char fields)
 *      - formatter: function(record) => string (for char fields)
 *      - component: Component (for component fields)
 *      - classes: Object (optional) CSS classes to apply to the cell
 * - records: Array of records to display.
 * - value: The id of the selected record.
 * - onClick: Function to call when a record is clicked. Receives the record as argument.
 * - close: Function to close the list view (in case of popup).
 * - header: Boolean to indicate if the header should be displayed.
 * - headerAction: Object { label: string, action: function } to display an action button in the header.
 * - headerTitle: String to display as title in the header.
 */
export class PosListView extends Component {
    static template = "point_of_sale.PosListView";
    static components = { Dropdown, DropdownItem, Input };
    static props = {
        fields: { type: Array },
        records: { type: Array },
        value: { type: [Number, String], optional: true },
        onClick: { type: Function },
        close: { type: Function, optional: true },
        header: { type: Boolean, optional: true, default: false },
        headerAction: { type: Object, optional: true },
        headerTitle: { type: String, optional: true },
    };

    setup() {
        super.setup();
        this.pos = usePos();
        this.ui = useState(useService("ui"));
        this.cells = this.props.fields.filter((field) => field.type !== "action");
        this.action = this.props.fields.find((field) => field.type === "action");
        this.state = useState({
            searchInput: "",
        });
    }

    get records() {
        return this.props.records.sort((a, b) => {
            const isSelected = (record) => record.id === this.props.value;
            if (isSelected(a) && !isSelected(b)) {
                return -1;
            }
            if (!isSelected(a) && isSelected(b)) {
                return 1;
            }
            return a.name.localeCompare(b.name);
        });
    }

    clickRecord(rec) {
        this.props.onClick(rec);
        this.props.close();
    }

    getRowClass(index) {
        const isEven = index % 2 === 0;
        return isEven ? "" : "bg-secondary";
    }
}
