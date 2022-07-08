odoo.define('pos_restaurant.TicketScreen', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const TicketScreen = require('point_of_sale.TicketScreen');
    const Registries = require('point_of_sale.Registries');
    const { useAutofocus } = require('web.custom_hooks');
    const { posbus } = require('point_of_sale.utils');
    const { parse } = require('web.field_utils');
    const { useState, useContext } = owl.hooks;

    const PosResTicketScreen = (TicketScreen) =>
        class extends TicketScreen {
            close() {
                super.close();
                if (!this.env.pos.config.iface_floorplan) {
                    // Make sure the 'table-set' event is triggered
                    // to properly rerender the components that listens to it.
                    posbus.trigger('table-set');
                }
            }
            _getScreenToStatusMap() {
                return Object.assign(super._getScreenToStatusMap(), {
                    PaymentScreen: this.env.pos.config.set_tip_after_payment ? 'OPEN' : super._getScreenToStatusMap().PaymentScreen,
                    TipScreen: 'TIPPING',
                });
            }
            getTable(order) {
                if(order.table)
                    return `${order.table.floor.name} (${order.table.name})`;
                return null;
            }
            //@override
            _getSearchFields() {
                if (!this.env.pos.config.iface_floorplan) {
                    return super._getSearchFields();
                }
                return Object.assign({}, super._getSearchFields(), {
                    TABLE: {
                        repr: (order) => `${order.table.floor.name} (${order.table.name})`,
                        displayName: this.env._t('Table'),
                        modelField: 'table_id.name',
                    }
                });
            }
            _setOrder(order) {
                if (!this.env.pos.config.iface_floorplan || order === this.env.pos.get_order()) {
                    super._setOrder(order);
                } else if (order !== this.env.pos.get_order()) {
                    // Only call set_table if the order is not the same as the current order.
                    // This is to prevent syncing to the server because syncing is only intended
                    // when going back to the floorscreen or opening a table.
                    this.env.pos.set_table(order.table, order);
                }
            }
            shouldShowNewOrderButton() {
                return this.env.pos.config.iface_floorplan ? Boolean(this.env.pos.table) : super.shouldShowNewOrderButton();
            }
            _getOrderList() {
                if (this.env.pos.table) {
                    return super._getOrderList();
                } else {
                    return this.env.pos.get('orders').models;
                }
            }
            async settleTips() {
                // set tip in each order
                for (const order of this.getFilteredOrderList()) {
                    const tipAmount = parse.float(order.uiState.TipScreen.state.inputTipAmount || '0');
                    const serverId = this.env.pos.validated_orders_name_server_id_map[order.name];
                    if (!serverId) {
                        console.warn(`${order.name} is not yet sync. Sync it to server before setting a tip.`);
                    } else {
                        const result = await this.setTip(order, serverId, tipAmount);
                        if (!result) break;
                    }
                }
            }
            async setTip(order, serverId, amount) {
                try {
                    const paymentline = order.get_paymentlines()[0];
                    if (paymentline.payment_method.payment_terminal) {
                        paymentline.amount += amount;
                        this.env.pos.set_order(order, {silent: true});
                        await paymentline.payment_method.payment_terminal.send_payment_adjust(paymentline.cid);
                    }

                    if (!amount) {
                        await this.setNoTip(serverId);
                    } else {
                        order.finalized = false;
                        order.set_tip(amount);
                        order.finalized = true;
                        const tip_line = order.selected_orderline;
                        await this.rpc({
                            method: 'set_tip',
                            model: 'pos.order',
                            args: [serverId, tip_line.export_as_JSON()],
                        });
                    }
                    order.finalize();
                    return true;
                } catch (error) {
                    const { confirmed } = await this.showPopup('ConfirmPopup', {
                        title: 'Failed to set tip',
                        body: `Failed to set tip to ${order.name}. Do you want to proceed on setting the tips of the remaining?`,
                    });
                    return confirmed;
                }
            }
            async setNoTip(serverId) {
                await this.rpc({
                    method: 'set_no_tip',
                    model: 'pos.order',
                    args: [serverId],
                });
            }
            _getOrderStates() {
                const result = super._getOrderStates();
                if (this.env.pos.config.set_tip_after_payment) {
                    result.delete('PAYMENT');
                    result.set('OPEN', { text: this.env._t('Open'), indented: true });
                    result.set('TIPPING', { text: this.env._t('Tipping'), indented: true });
                }
                return result;
            }
        };

    Registries.Component.extend(TicketScreen, PosResTicketScreen);

    class TipCell extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = useState({ isEditing: false });
            this.orderUiState = useContext(this.props.order.uiState.TipScreen);
            useAutofocus({ selector: 'input' });
        }
        get tipAmountStr() {
            return this.env.pos.format_currency(parse.float(this.orderUiState.inputTipAmount || '0'));
        }
        onBlur() {
            this.state.isEditing = false;
        }
        onKeydown(event) {
            if (event.key === 'Enter') {
                this.state.isEditing = false;
            }
        }
        editTip() {
            this.state.isEditing = true;
        }
    }
    TipCell.template = 'TipCell';

    Registries.Component.add(TipCell);

    return { TicketScreen, TipCell };
});
