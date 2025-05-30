import { Plugin } from "@html_editor/plugin";
import { SNIPPET_SPECIFIC_NEXT } from "@html_builder/utils/option_sequence";
import { withSequence } from "@html_editor/utils/resource";
import { reactive } from "@odoo/owl";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { websiteSaleRibbonOption } from "./website_sale_ribbon_option";

class websiteSaleRibbonOptionPlugin extends Plugin {
    static id = 'websiteSaleRibbonOptionPlugin';
    static dependencies = ['history'];
    count = reactive({ value: 0 });

    resources = {
        builder_options: [
            withSequence(SNIPPET_SPECIFIC_NEXT, {
                OptionComponent: websiteSaleRibbonOption,
                name: 'websiteSaleRibbonOption',
                props: {
                    loadInfo: this.loadInfo.bind(this),
                    count: this.count,
                },
                selector: "#products_grid .oe_product",
                editableOnly: false,
                groups: ['website.group_website_designer'],
            }),
        ],
        builder_actions: this.getActions(),
    };

    setup() {
        this.positionClasses = { left: "o_left", right: "o_right" };
        this.styleClasses = { ribbon: "o_ribbon", tag: "o_tag" };
        this.recordRibbons = [];
        this.editMode = false;
    }

    getActions() {
        const historyPlugin = this.dependencies.history;
        return {
            setRibbon: {
                isApplied: ({ editingElement, value }) => {
                    const ribbonId = parseInt(
                        editingElement.querySelector('.o_ribbons').dataset.ribbonId,
                    );
                    const match = !ribbonId || !this.ribbonsObject.hasOwnProperty(ribbonId)
                        ? ""
                        : ribbonId;
                    return match === value;
                },
                apply: ({ editingElement, value }) => {
                    this.recordId = parseInt(
                        editingElement.querySelector('.o_ribbons').dataset.recordId,
                    );
                    this.recordRibbons.push({
                        recordId: this.recordId,
                        ribbonId: value,
                    });

                    const ribbon = this.ribbonsObject[value] || {
                        id: "",
                        name: "",
                        bg_color: "",
                        text_color: "",
                        position: "left",
                        style: "ribbon",
                    };

                    return this._setRibbon(
                        editingElement.querySelector('.o_ribbons'),
                        ribbon,
                        !historyPlugin.getIsPreviewing(),
                    );
                },
            },
            createRibbon: {
                apply: ({ editingElement }) => {
                    this.recordId = parseInt(
                        editingElement.querySelector('.o_ribbons').dataset.recordId,
                    );
                    const ribbonId = Date.now();
                    this.recordRibbons.push({
                        recordId: this.recordId,
                        ribbonId: ribbonId,
                    });
                    const ribbon = reactive({
                        id: ribbonId,
                        name: "Ribbon Name",
                        bg_color: "",
                        text_color: "purple",
                        position: "left",
                        style: "ribbon",
                    });
                    this.ribbons.push(ribbon);
                    this.ribbonsObject[ribbonId] = ribbon;
                    return this._setRibbon(editingElement.querySelector('.o_ribbons'), ribbon);
                },
            },
            modifyRibbon: {
                getValue: ({ editingElement, params }) => {
                    const ribbonId = parseInt(
                        editingElement.querySelector('.o_ribbons').dataset.ribbonId
                    );
                    if (!ribbonId) {
                        return;
                    };

                    return this.ribbonsObject[ribbonId][params.mainParam];
                },
                isApplied: ({ editingElement, params, value }) => {
                    let ribbonId = parseInt(
                        editingElement.querySelector('.o_ribbons').dataset.ribbonId
                    );
                    if (!ribbonId) {
                        return;
                    }
                    return this.ribbonsObject[ribbonId][params.mainParam] === value;
                },
                apply:  ({ editingElement, params, value }) => {
                    const ribbonEl = editingElement.querySelector('.o_ribbons')
                    const setting = params.mainParam;
                    const ribbonId = parseInt(ribbonEl.dataset.ribbonId);
                    const ribbon = this.ribbons.find((ribbon) => ribbon.id == ribbonId);
                    const previousValue = this.ribbonsObject[ribbonId][setting]
                    this.ribbonsObject[ribbonId][setting] = value;
                    ribbon[setting] = value;
                    const isPreviewing = historyPlugin.getIsPreviewing();
                    const res = this._setRibbon(
                        ribbonEl, ribbon, !isPreviewing,
                    );
                    if(isPreviewing) {
                        this.ribbonsObject[ribbonId][setting] = previousValue;
                        ribbon[setting] = previousValue;
                    }
                    return res;
                },
            },
            deleteRibbon: {
                apply: async ({ editingElement }) => {
                    const save = await new Promise((resolve) => {
                        this.services.dialog.add(ConfirmationDialog, {
                            body: _t("Are you sure you want to delete this ribbon?"),
                            confirm: () => resolve(true),
                            cancel: () => resolve(false),
                        });
                    });
                    if (!save) {
                        return;
                    }
                    return this._deleteRibbon(editingElement);
                },
            },
        };
    }

    async loadInfo() {
        if (!this.ribbons) {
            const result = await this.services.orm.searchRead(
                'product.ribbon',
                [['assign', '=', 'manual']],
                ['id', 'name', 'bg_color', 'text_color', 'position', 'style']
            );
            this.ribbons = reactive(result);
        }

        this.ribbonsObject = this.ribbons.reduce((acc, ribbon) => {
            acc[ribbon.id] = ribbon;
            return acc;
        }, {});

        this.originalRibbons = JSON.parse(JSON.stringify(this.ribbonsObject));

        return this.ribbons;
    }

    async _setRibbon(editingElement, ribbon, save = true) {
        const ribbonId = ribbon.id;
        const editableBody = editingElement.ownerDocument.body;
        editingElement.dataset.ribbonId = ribbonId;

        // Update all ribbons with this ID
        const ribbons = editableBody.ownerDocument.querySelectorAll(
            `[data-ribbon-id="${ribbonId}"]`,
        );

        for (const ribbonElement of ribbons) {
            ribbonElement.textContent = ribbon.name;
            ribbonElement.classList.remove("o_ribbon", "o_tag", "o_right", "o_left");
            if (ribbonElement.classList.contains("d-none")) {
                ribbonElement.classList.remove("d-none");
            }

            ribbonElement.classList.add(
                this.positionClasses[ribbon.position],
                this.styleClasses[ribbon.style],
            );
            ribbonElement.style.backgroundColor = ribbon.bg_color || "";
            ribbonElement.style.color = ribbon.text_color || "";
        }

        return save ? await this._saveRibbons(editingElement.dataset.recordModel) : "";
    }

    async _saveRibbons(resModel) {
        const originalIds = Object.keys(this.originalRibbons).map((id) => parseInt(id));
        const currentIds = this.ribbons.map((ribbon) => parseInt(ribbon.id));
        const created = this.ribbons.filter((ribbon) => !originalIds.includes(ribbon.id));
        const deletedIds = originalIds.filter((id) => !currentIds.includes(id));
        const modified = this.ribbons.filter((ribbon) => {
            if (created.includes(ribbon)) {
                return false;
            }
            const original = this.originalRibbons[ribbon.id];
            return Object.entries(ribbon).some(([key, value]) => value !== original[key]);
        });

        const createdRibbonProms = [];
        let createdRibbonIds;
        if (created.length > 0) {
            createdRibbonProms.push(
                this.services.orm.create(
                    'product.ribbon',
                    created.map((ribbon) => {
                        ribbon = Object.assign({}, ribbon);
                        this.originalRibbons[ribbon.id] = ribbon;
                        delete ribbon.id;
                        return ribbon;
                    })
                ).then((ids) => (createdRibbonIds = ids))
            );
        }
        await Promise.all(createdRibbonProms);

        const localToServer = Object.assign(
            this.ribbonsObject,
            Object.fromEntries(
                created.map((ribbon, index) => [
                    ribbon.id,
                    { ...this.ribbonsObject[ribbon.id], id: createdRibbonIds[index] },
                ])
            ),
            {
                false: {
                    id: "",
                },
            }
        );
        const proms = [];
        for (const ribbon of modified) {
            const ribbonData = {
                name: ribbon.name,
                bg_color: ribbon.bg_color,
                text_color: ribbon.text_color,
                position: ribbon.position,
                style: ribbon.style,
            };
            const serverId = localToServer[ribbon.id]?.id || ribbon.id;
            proms.push(this.services.orm.write("product.ribbon", [serverId], ribbonData));
            this.originalRibbons[ribbon.id] = Object.assign({}, ribbon);
        }

        if (deletedIds.length > 0) {
            proms.push(this.services.orm.unlink('product.ribbon', deletedIds));
        }

        await Promise.all(proms);

        // Building the final record to ribbon-id map so that we can remove duplicate entries
        const finalRecordRibbons = this.recordRibbons.reduce(
            (acc, { recordId, ribbonId }) => {
                acc[recordId] = ribbonId;
                return acc;
            }, {},
        );
        // Inverting the relationship so that we have all records that have the same ribbon to
        // reduce RPCs
        const ribbonRecords = {};
        for (const [recordId, ribbonId] of Object.entries(finalRecordRibbons)) {
            const rid = ribbonRecords[ribbonId] ||= [];
            rid.push(parseInt(recordId));
        }

        const promises = [];
        for (const ribbonId in ribbonRecords) {
            const recordId = ribbonRecords[ribbonId];
            promises.push(
                this.services.orm.write(resModel, recordId, {
                    website_ribbon_id: parseInt(ribbonId) || false,
                })
            );
        }

        return Promise.all(promises);
    }

    /**
     * Deletes a ribbon.
     *
     */
    _deleteRibbon(editingElement) {
        const ribbonId = parseInt(editingElement.querySelector('.o_ribbons').dataset.ribbonId);
        if (this.ribbonsObject[ribbonId]) {
            const ribbonIndex = this.ribbons.findIndex(ribbon => ribbon.id === ribbonId);
            if (ribbonIndex !== -1 ) {
                this.ribbons.splice(ribbonIndex, 1);
            }
            delete this.ribbonsObject[ribbonId];

            // update "reactive" count to trigger rerendering the BuilderSelect component (which
            // has the value as a t-key)
            this.count.value++;
        }
        const isProductPage = editingElement.ownerDocument.querySelector('#product_detail');
        const ribbonData = editingElement.querySelector('.o_ribbons').dataset
        this.recordId = parseInt(ribbonData.recordId);
        const ribbons = editingElement.ownerDocument.querySelectorAll(
            `[data-ribbon-id="${ribbonId}"]`
        );
        ribbons.forEach((ribbonElement) => {
            ribbonElement.classList.add("d-none");
            ribbonElement.dataset.ribbonId = "";
            this.recordRibbons.push({
                recordId: isProductPage
                    ? this.recordId
                    : parseInt(ribbonElement.dataset.recordId),
                ribbonId: false,
            });
        });
        this._saveRibbons(ribbonData.recordModel);
    }
}

registry.category('website-plugins').add(
    websiteSaleRibbonOptionPlugin.id, websiteSaleRibbonOptionPlugin,
);
