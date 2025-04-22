import { MediaDialog } from "@web_editor/components/media_dialog/media_dialog";
import options from "@web_editor/js/editor/snippets.options";
import { productRibbonMixin } from "@website_sale/js/product_ribbon_mixin";
import { rpc } from "@web/core/network/rpc";


options.registry.dynamic_snippet_category = options.Class.extend({
    /**
     *
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);
        this.dynamicFilters = {};
    },

    async willStart() {
        const _super = this._super.bind(this);
        const dynamicFilters = await rpc(
            '/website/snippet/options_filters', {model_name: 'product.public.category'}
        );
        if (dynamicFilters.length) {
            for (let index in dynamicFilters) {
                this.dynamicFilters[dynamicFilters[index].id] = dynamicFilters[index];
            }
            this._defaultFilterId = dynamicFilters[0].id;
        }
        return _super(...arguments);
    },

    /**
     *
     * @override
     */
    async onBuilt() {
        // Default values depend on the templates and filters available.
        // Therefore, they cannot be computed prior the start of the option.
        this.$target.get(0).dataset['columns'] = 2;
        this.$target.get(0).dataset['height'] = "small";
        this.$target.get(0).dataset['filterId'] = this._defaultFilterId;
        this.$target.get(0).dataset['alignment'] = "left";
        this.$target.get(0).dataset['button'] = "Explore Now";
    },

    /**
     *
     * @override
     * @private
     */
    _renderCustomXML: async function (uiFragment) {
        const filtersSelectorEl = uiFragment.querySelector("[data-name='filter_opt']");
        for (let id in this.dynamicFilters) {
            const button = document.createElement("we-button");
            button.dataset.selectDataAttribute = id;
            if (this.dynamicFilters[id].thumb) {
                button.dataset.img = this.dynamicFilters[id].thumb;
            } else {
                button.innerText = this.dynamicFilters[id].name;
            }
            if (this.dynamicFilters[id].help) {
                button.title = this.dynamicFilters[id].help;
            }
            filtersSelectorEl.appendChild(button);
        }
    },
})

options.registry.dynamic_snippet_category_item = productRibbonMixin(options.Class.extend({
    /**
     * @override
     */
    willStart: async function () {
        this.recordId = parseInt(this.$target.get(0).dataset.categoryId);
        this.recordModel = 'product.public.category';
        return this._super(...arguments);
    },

    onSetRibbon: async function(previewMode) {
        if(!previewMode){
            this.trigger_up('request_save', {reload: true, optionSelector: `.s_dynamic_category`});
        }
    }
}))

class categoryMedia extends MediaDialog{
    async save(){
        const nodeData = this.props.node.parentElement.dataset
        rpc('/snippets/category/set_image',{
            category_id: parseInt(nodeData.categoryId),
            media: this.selectedMedia[this.state.activeTab],
        })
        this.props.close()
        await super.save();
    }
}

options.registry.ReplaceMedia.include({
    async replaceMedia() {
        if (this.$target.closest(".s_dynamic_category").length > 0) {
            const imageEl = this.$target.get(0).querySelector(".s_category_image")
            if(this.$target.get(0).classList.contains("category_item")){
                this.call('dialog', 'add', categoryMedia, {
                    node: imageEl,
                    noDocuments: true,
                    noVideos: true,
                    noIcons: true,
                    save:() => {this.trigger_up('request_save', {
                        reload: true, optionSelector: ".s_dynamic_category"
                    })},
                })
            }else{
                await this.options.wysiwyg.openMediaDialog({
                    node: imageEl,
                    noDocuments: true,
                    noVideos: true,
                    noIcons: true,
                });
            }
        }else {
            await this._super(...arguments);
        }
    },
})


