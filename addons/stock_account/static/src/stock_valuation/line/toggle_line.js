import { useState } from "@odoo/owl";
import { StockValuationReportLine } from "./line";


export class StockValuationReportToggleLine extends StockValuationReportLine {
    static template = "stock_account.StockValuationReport.InventoryValuationToggleLine";

    // setup() {
    //     super.setup();
    //     this.state = useState({
    //         checked: false,
    //         displaySublines: true,
    //     });
    // }

    // On Click Methods --------------------------------------------------------
    onClickToggle() {
        super.onClickToggle();
        this.state.checked = !this.state.checked;
    }
}

StockValuationReportToggleLine.components.StockValuationReportToggleLine = StockValuationReportToggleLine;