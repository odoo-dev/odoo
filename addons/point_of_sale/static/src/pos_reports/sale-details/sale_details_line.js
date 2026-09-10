import { registry } from "@web/core/registry";
import { TreeNode } from "../components/tree_node/tree_node";

export class SaleDetailsLine extends TreeNode {
    static template = "pos_reports.SaleDetailsLine";
}

const saleDetailsLine = {
    component: SaleDetailsLine,
    report: "Sales Detail New",
    slot: "TreeNode",
};

registry.category("pos_report_components").add("sale_details_treeNode", saleDetailsLine);
