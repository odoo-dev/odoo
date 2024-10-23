import { registry } from "@web/core/registry";
import { ElementToolboxContainer } from "../../components/ElementToolboxContainer";
import { Component } from "@odoo/owl";

class RowDivElementToolbox extends Component {
    static template = "mysterious_egg.RowDivElementToolbox";
    static components = {
        ElementToolboxContainer,
    };
}

registry.category("sidebar-element-toolbox").add("RowDivElementToolbox", {
    ToolboxComponent: RowDivElementToolbox,
    selector: "section .row > div",
});
