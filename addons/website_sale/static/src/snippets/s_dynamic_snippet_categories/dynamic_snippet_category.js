import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import { listenSizeChange, utils as uiUtils } from "@web/core/ui/ui_service";
import { renderToFragment } from "@web/core/utils/render";
import { Interaction } from "@web/public/interaction";


export class dynamicSnippetCategory extends Interaction{
    static selector = ".s_dynamic_category";

    async willStart() {
        this.ribbons = await this.waitFor(rpc('/shop/ribbons'));
        const filterId = this.el.dataset.filterId;
        this.data = filterId
            ? await this.waitFor(rpc("/shop/categories", { filter_id: parseInt(filterId) }))
            : [];
    }

    start(){
        this.registerCleanup(listenSizeChange(this.render.bind(this)));
        this.render();
    }

    render(){
        const nodeData = this.el.dataset;
        const HEIGHT_MAP = {
            small: { span: 2, row: "10vh" },
            medium: { span: 2, row: "15vh" },
            large: { span: 4, row: "15vh" },
        };
        const alignmentMap = {
            left: "justify-content-between",
            center: "align_category_center",
            right: "justify-content-between align_category_right",
        };
        const alignmentClass = alignmentMap[nodeData.alignment];

        // Clear existing content and render with new values
        const categoryGrid = this.el.querySelector('.s_category_container');
        categoryGrid.querySelectorAll('.category_item').forEach(el => {el.remove()});
        categoryGrid.appendChild(
            renderToFragment('website_sale.dynamic_filter_template_categories', {
                data: this.data,
                ribbons: this.ribbons,
                get_ribbon: this.get_ribbon,
                height: HEIGHT_MAP[nodeData.height]['span'],
                alignmentClass: alignmentClass,
                buttonText: _t(nodeData.button),
            }
        ));

        // Styling for grid
        const columns = uiUtils.isSmall()? 1 : parseInt(nodeData.columns);
        if (columns == 1){
            categoryGrid.style.setProperty(
                'grid-template-columns', `100%`
            );
        }else{
            categoryGrid.style.setProperty(
                'grid-template-columns', `repeat(${columns}, calc((100% / ${columns}) - 0.7rem))`
            );
        }
        categoryGrid.style.setProperty(
            'grid-auto-rows', `minmax(${HEIGHT_MAP[nodeData.height]['row']}, auto)`
        );

        // Styling for all_products item
        const allProducts = this.el.querySelector('.all_products');
        if (nodeData.allProducts === 'true'){
            allProducts.classList.remove('d-none');

            const overlay = allProducts.querySelector('.s_category_overlay');
            overlay.classList.remove(
                'justify-content-between',
                'align_category_right',
                'align_category_center'
            );
            overlay.className += " " + alignmentClass;

            const headingEl = allProducts.querySelector('.all_products_heading');
            headingEl.textContent = headingEl.textContent.trim() || "All Collections";

            allProducts.querySelector('a').textContent = nodeData.button;

            const shouldSpanTwo = columns !== 1 &&
                (['large', 'medium'].includes(nodeData.height) || columns === 5);
            allProducts.style.setProperty('grid-column', `span ${shouldSpanTwo ? 2 : 1}`);
        } else {
            allProducts.classList.add("d-none");
        }
    }

    get_ribbon(ribbonId){
        return ribbonId
            ? this.ribbons.find(ribbon => ribbon.id === parseInt(ribbonId))
            : { name: "", bg_color: "", text_color: "", position: "left", style: "ribbon" };
    }
}

registry
    .category("public.interactions")
    .add("website_sale.dynamic_snippet_category", dynamicSnippetCategory);

registry
    .category("public.interactions.edit")
    .add("website_sale.dynamic_snippet_category", {Interaction: dynamicSnippetCategory});
