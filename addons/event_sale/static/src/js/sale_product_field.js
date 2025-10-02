import { patch } from "@web/core/utils/patch";
import { SaleOrderLineProductField } from "@sale/js/sale_product_field";
import { useService } from "@web/core/utils/hooks";

patch(SaleOrderLineProductField.prototype, {
    setup() {
        super.setup();
        this.action = useService("action");
    },
    get isEvent() {
        return this.props.record.data.service_tracking === "event";
    },
    get hasConfigurationButton() {
        return super.hasConfigurationButton || this.isEvent;
    },
    onEditConfiguration() {
        if (this.isEvent) {
            this._openEventConfigurator();
        } else {
            super.onEditConfiguration();
        }
    },
    _onProductUpdate() {
        if (this.isEvent) {
            this._openEventConfigurator();
        } else {
            super._onProductUpdate();
        }
    },

    async handleComboSave(comboProductData, selectedComboItems, edit, hasOptionalProducts) {
        await super.handleComboSave(...arguments);
        if (this.isEvent) {
            await this._openEventConfigurator(selectedComboItems);
        }
    },

    async _openEventConfigurator(selectedComboItems) {
        const actionContext = {
            default_product_id: this.props.record.data.product_id.id,
        };
        if (this.props.record.data.event_id) {
            actionContext.default_event_id = this.props.record.data.event_id.id;
        }
        if (this.props.record.data.event_slot_id) {
            actionContext.default_event_slot_id = this.props.record.data.event_slot_id[0];
        }
        if (this.props.record.data.event_ticket_id) {
            actionContext.default_event_ticket_id = this.props.record.data.event_ticket_id.id;
        }
        if (selectedComboItems) {
            actionContext.default_event_selected_product_ids = selectedComboItems.map(comboItem => comboItem.product.id);
        }
        this.action.doAction(
            'event_sale.event_configurator_action',
            {
                additionalContext: actionContext,
                onClose: async (closeInfo) => {
                    if (!closeInfo || closeInfo.special) {
                        // wizard popup closed or 'Cancel' button triggered
                        if (!this.props.record.data.event_ticket_id) {
                            // remove product if event configuration was cancelled.
                            this.props.record.update({
                                [this.props.name]: undefined,
                            });
                        }
                    } else {
                        const eventConfiguration = closeInfo.eventConfiguration;
                        const eventComboConfiguration = closeInfo.eventComboConfiguration;
                        this.props.record.update(eventConfiguration);
                        if (eventComboConfiguration?.combo_ticket_id) {
                            const orderLines = this.props.record.model.root.data.order_line.records;
                            const selectedTicketLine = orderLines.filter(line => line.data.product_id.id === eventComboConfiguration.combo_ticket_product_id.id)[0];
                            selectedTicketLine.update({
                                event_id: eventConfiguration.event_id,
                                event_slot_id: eventConfiguration.event_slot_id,
                                event_ticket_id: eventComboConfiguration.combo_ticket_id,
                            });
                        }
                    }
                }
            }
        );
    },
});
