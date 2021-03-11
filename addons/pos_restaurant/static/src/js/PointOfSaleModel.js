odoo.define('pos_restaurant.PointOfSaleModel', function (require) {
    'use strict';

    const PointOfSaleModel = require('point_of_sale.PointOfSaleModel');
    const { sum, generateWrappedName } = require('point_of_sale.utils');
    const { Printer } = require('point_of_sale.Printer');
    const { patch } = require('web.utils');
    const { qweb, _t } = require('web.core');
    const { parse } = require('web.field_utils');

    return patch(PointOfSaleModel.prototype, 'pos_restaurant', {
        setup() {
            this._super(...arguments);
            this.ifaceFloorplan = false;
        },
        _initDataDerived() {
            const result = this._super();
            result.sortedFloors = [];
            return result;
        },
        _initDataUiState() {
            const result = this._super();
            result.activeTableId = false;
            result.activeFloorId = false;
            result.orderIdToTransfer = false;
            result.orderIdsToRemove = new Set([]);
            result.FloorScreen = {
                selectedTableId: false,
                isEditMode: false,
            };
            return result;
        },
        async _assignTopLevelFields() {
            await this._super();
            this.ifaceFloorplan =
                this.config.module_pos_restaurant && Boolean(this.getRecords('restaurant.floor').length);
            this.ifacePrinters = this.config.is_order_printer && Boolean(this.getRecords('restaurant.printer').length);
        },
        async _assignDataDerived() {
            await this._super();
            this.data.derived.sortedFloors = this.getRecords('restaurant.floor').sort(
                (a, b) => a.sequence - b.sequence
            );
            this._setKitchenPrinters();
        },
        _getDefaultTableId() {
            const firstFloor = this.data.derived.sortedFloors[0];
            const firstTableId = firstFloor.table_ids[0];
            if (!firstTableId) {
                return this.getRecords('restaurant.table')[0].id;
            } else {
                return firstTableId;
            }
        },
        getStartScreen() {
            if (this.ifaceFloorplan) return 'FloorScreen';
            return this._super();
        },
        async actionDoneLoading() {
            await this._super();
            if (this.ifaceFloorplan) {
                this.actionSetFloor(this.data.derived.sortedFloors[0]);
                this._setActivityListeners();
            }
        },
        async actionOrderDone(order, nextScreen) {
            await this._super(...arguments);
            if (nextScreen === 'FloorScreen') {
                await this.actionExitTable(this.getActiveTable());
            }
        },
        _createDefaultOrder() {
            const result = this._super();
            if (this.ifaceFloorplan) {
                result.table_id = this.data.uiState.activeTableId || this._getDefaultTableId();
            }
            result.customer_count = 1;
            return result;
        },
        getOrderJSON(order) {
            const result = this._super(...arguments);
            result.table_id = order.table_id;
            result.customer_count = order.customer_count;
            result.multiprint_resume = order.multiprint_resume;
            return result;
        },
        getOrderlineJSON(orderline) {
            const result = this._super(...arguments);
            result.mp_dirty = orderline.mp_dirty;
            result.mp_skip = orderline.mp_skip;
            result.note = orderline.note;
            return result;
        },
        async actionSelectOrder(order) {
            await this._super(...arguments);
            const activeTable = this.getActiveTable();
            const orderTable = this.getRecord('restaurant.table', order.table_id);
            if (activeTable && orderTable !== activeTable) {
                await this._syncToServer(activeTable);
                await this._syncFromServer(orderTable);
            }
            if (!activeTable) {
                await this._syncFromServer(orderTable);
            }
            if (!this.data.uiState.OrderManagementScreen.managementOrderIds.has(order.id) && order.table_id) {
                const table = this.getRecord('restaurant.table', order.table_id);
                this.data.uiState.activeTableId = order.table_id;
                this.data.uiState.activeFloorId = table.floor_id;

                if(order.lines)
                    this.actionSelectOrderline(order, order.lines[order.lines.length - 1]);
            }
        },
        actionUpdateOrderline(orderline, vals) {
            if ('qty' in vals) {
                if (
                    this.ifacePrinters &&
                    this.floatCompare(orderline.qty, vals.qty, 5) !== 0 &&
                    this._isProductInCategory(this.data.derived.printersCategoryIds, orderline.product_id)
                ) {
                    vals.mp_dirty = true;
                }
            } else if ('mp_skip' in vals) {
                if (orderline.mp_dirty && vals.mp_skip && !orderline.mp_skip) {
                    vals.mp_skip = true;
                }
                if (orderline.mp_skip && !vals.mp_skip) {
                    vals.mp_dirty = true;
                    vals.mp_skip = false;
                }
            }
            this._super(...arguments);
        },
        _canBeMergedWith(existingLine, line2merge) {
            return (
                existingLine.note === line2merge.note &&
                !existingLine.mp_skip &&
                !line2merge.mp_skip &&
                this._super(...arguments)
            );
        },
        _createOrderline(vals) {
            if (this.ifacePrinters) {
                vals.mp_dirty = this._isProductInCategory(this.data.derived.printersCategoryIds, vals.product_id);
            }
            if (!('note' in vals)) {
                vals.note = '';
            }
            return this._super(...arguments);
        },
        getActiveScreenProps() {
            const result = this._super(...arguments);
            result.activeFloor = this.getActiveFloor();
            return result;
        },
        getOrderInfo(order) {
            const receipt = this._super(...arguments);
            if (this.ifaceFloorplan) {
                const table = this.getRecord('restaurant.table', order.table_id);
                const floor = this.getRecord('restaurant.floor', table.floor_id);
                receipt.table = table ? table.name : '';
                receipt.floor = floor ? floor.name : '';
            }
            receipt.customer_count = order.customer_count;
            return receipt;
        },

        _setKitchenPrinters() {
            const restaurantPrinters = this.getRecords('restaurant.printer');
            const printers = restaurantPrinters.map((config) => {
                const printer = this._createPrinter(config);
                printer.config = config;
                return printer;
            });
            // list of product categories that belong to one or more order printer
            const printersCategoryIds = [
                ...new Set(
                    restaurantPrinters.reduce(
                        (categoryIds, printer) => [...categoryIds, ...printer.product_categories_ids],
                        []
                    )
                ),
            ];
            this.data.derived.printers = printers;
            this.data.derived.printersCategoryIds = printersCategoryIds;
        },
        _createPrinter: function (config) {
            var url = config.proxy_ip || '';
            if (url.indexOf('//') < 0) {
                url = window.location.protocol + '//' + url;
            }
            if (url.indexOf(':', url.indexOf('//') + 2) < 0 && window.location.protocol !== 'https:') {
                url = url + ':8069';
            }
            return new Printer(url, this);
        },
        /**
         * from a product id, and a list of category ids, returns
         * true if the product belongs to one of the provided category
         * or one of its child categories.
         */
        _isProductInCategory: function (categoryIds, productId) {
            if (!(categoryIds instanceof Array)) {
                categoryIds = [categoryIds];
            }
            let cat = this.getRecord('product.product', productId).pos_categ_id;
            while (cat) {
                for (const categoryId of categoryIds) {
                    // The == is important, ids may be strings
                    if (cat == categoryId) {
                        return true;
                    }
                }
                cat = this.data.derived.categoryParent[cat];
            }
            return false;
        },
        _getLineDiffHash(orderline) {
            if (orderline.note) {
                return orderline.id + '|' + orderline.note;
            } else {
                return '' + orderline.id;
            }
        },
        _buildOrderResume(order) {
            const resume = {};
            for (const line of this.getOrderlines(order)) {
                if (line.mp_skip) continue;
                const lineHash = this._getLineDiffHash(line);
                if (typeof resume[lineHash] === 'undefined') {
                    resume[lineHash] = {
                        qty: line.qty,
                        note: line.note,
                        product_id: line.product_id,
                        product_name_wrapped: generateWrappedName(this.getFullProductName(line)),
                    };
                } else {
                    resume[lineHash].qty += line.qty;
                }
            }
            return resume;
        },
        _saveResumeChanges(order) {
            order.multiprint_resume = this._buildOrderResume(order);
            for (const orderline of this.getOrderlines(order)) {
                orderline.mp_dirty = false;
            }
        },
        _computeResumeChanges(order, categories) {
            const current_res = this._buildOrderResume(order);
            const old_res = order.multiprint_resume || {};
            let add = [];
            let rem = [];

            for (const line_hash in current_res) {
                const curr = current_res[line_hash];
                let old = {};
                let found = false;
                for (const id in old_res) {
                    if (old_res[id].product_id === curr.product_id) {
                        found = true;
                        old = old_res[id];
                        break;
                    }
                }
                if (!found) {
                    add.push({
                        id: curr.product_id,
                        name: this.getRecord('product.product', curr.product_id).display_name,
                        name_wrapped: curr.product_name_wrapped,
                        note: curr.note,
                        qty: curr.qty,
                    });
                } else if (old.qty < curr.qty) {
                    add.push({
                        id: curr.product_id,
                        name: this.getRecord('product.product', curr.product_id).display_name,
                        name_wrapped: curr.product_name_wrapped,
                        note: curr.note,
                        qty: curr.qty - old.qty,
                    });
                } else if (old.qty > curr.qty) {
                    rem.push({
                        id: curr.product_id,
                        name: this.getRecord('product.product', curr.product_id).display_name,
                        name_wrapped: curr.product_name_wrapped,
                        note: curr.note,
                        qty: old.qty - curr.qty,
                    });
                }
            }

            for (const line_hash in old_res) {
                let found = false;
                for (const id in current_res) {
                    if (current_res[id].product_id === old_res[line_hash].product_id) {
                        found = true;
                    }
                }
                if (!found) {
                    const old = old_res[line_hash];
                    rem.push({
                        id: old.product_id,
                        name: this.getRecord('product.product', old.product_id).display_name,
                        name_wrapped: old.product_name_wrapped,
                        note: old.note,
                        qty: old.qty,
                    });
                }
            }

            if (categories && categories.length > 0) {
                // filter the added and removed orders to only contains
                // products that belong to one of the categories supplied as a parameter

                const _add = [];
                const _rem = [];

                for (const item of add) {
                    if (this._isProductInCategory(categories, item.id)) {
                        _add.push(item);
                    }
                }
                add = _add;

                for (const item of rem) {
                    if (this._isProductInCategory(categories, item.id)) {
                        _rem.push(item);
                    }
                }
                rem = _rem;
            }

            const d = new Date();
            let hours = '' + d.getHours();
            hours = hours.length < 2 ? '0' + hours : hours;
            let minutes = '' + d.getMinutes();
            minutes = minutes.length < 2 ? '0' + minutes : minutes;

            const table = this.getRecord('restaurant.table', order.table_id);
            const floor = this.getRecord('restaurant.floor', table.floor_id);

            return {
                new: add,
                cancelled: rem,
                table: table ? table.name : false,
                floor: floor ? floor.name : false,
                name: this.getOrderName(order),
                time: {
                    hours: hours,
                    minutes: minutes,
                },
            };
        },
        hasResumeChangesToPrint(order) {
            for (const printer of this.data.derived.printers) {
                var changes = this._computeResumeChanges(order, printer.config.product_categories_ids);
                if (changes['new'].length > 0 || changes['cancelled'].length > 0) {
                    return true;
                }
            }
            return false;
        },
        hasSkippedResumeChanges(order) {
            const orderlines = this.getOrderlines(order);
            for (const line of orderlines) {
                if (line.mp_skip) return true;
            }
            return false;
        },
        /**
         * @param {'pos.order'} order
         */
        _isFullPayOrder(originalOrder, splitlines) {
            const groupedLines = _.groupBy(this.getOrderlines(originalOrder), (line) => line.product_id);
            let full = true;
            for (const lineId in groupedLines) {
                let maxQuantity = groupedLines[lineId].reduce((quantity, line) => quantity + line.qty, 0);
                for (const id in splitlines) {
                    const split = splitlines[id];
                    if (split.product === groupedLines[lineId][0].product_id) {
                        maxQuantity -= split.quantity;
                    }
                }
                if (maxQuantity !== 0) {
                    full = false;
                }
            }
            return full;
        },
        /**
         * @param {'pos.order'} order
         * @param {'pos.order.line'} line
         */
        addOrderline(order, line) {
            this.updateRecord('pos.order.line', line.id, { order_id: order.id });
            this.updateRecord('pos.order', order.id, { lines: [...order.lines, line.id] });
            order._extras.activeOrderlineId = line.id;
        },
        async actionSetFloor(floor) {
            this.data.uiState.activeTableId = false;
            this.data.uiState.activeFloorId = floor.id;
            this.data.uiState.FloorScreen.isEditMode = false;
            await this.actionShowScreen('FloorScreen');
        },
        async actionSetTable(table) {
            if (this.data.uiState.FloorScreen.isEditMode) {
                this.data.uiState.FloorScreen.selectedTableId = table.id;
            } else {
                this.data.uiState.activeTableId = table.id;
                await this._syncFromServer(table);
                if (this.data.uiState.orderIdToTransfer) {
                    const orderToTransfer = this.getRecord('pos.order', this.data.uiState.orderIdToTransfer);
                    this.updateRecord('pos.order', orderToTransfer.id, { table_id: table.id });
                    this.data.uiState.orderIdToTransfer = false;
                    await this.actionSelectOrder(orderToTransfer);
                } else {
                    const tableOrders = this.getTableOrders(table);
                    if (tableOrders.length) {
                        await this.actionSelectOrder(tableOrders[0]);
                    } else {
                        await this.actionCreateNewOrder();
                    }
                }
            }
        },
        actionDeselectTable() {
            this.data.uiState.FloorScreen.selectedTableId = false;
        },
        async actionTransferOrder(order) {
            const table = this.getRecord('restaurant.table', order.table_id);
            this.updateRecord('pos.order', order.id, { table_id: false });
            await this.actionExitTable(table);
            this.data.uiState.orderIdToTransfer = order.id;
        },
        actionSetCustomerCount(order, count) {
            this.updateRecord('pos.order', order.id, { customer_count: count });
        },
        async actionSplitOrder(originalOrder, newOrder, splitlines, noDecrease) {
            if (this._isFullPayOrder(originalOrder, splitlines)) {
                this.actionDeleteOrder(newOrder);
            } else {
                for (const lineId in splitlines) {
                    const split = splitlines[lineId];
                    if (this.floatCompare(split.quantity, 0, 5) > 0) {
                        const line = this.getRecord('pos.order.line', lineId);
                        if (!noDecrease) {
                            this.updateRecord('pos.order.line', line.id, { qty: line.qty - split.quantity });
                            if (this.floatCompare(line.qty, 0, 5) === 0) {
                                this.actionDeleteOrderline(originalOrder, line);
                            }
                        } else {
                            const decreaseLine = this.cloneRecord('pos.order.line', line, {
                                id: this._getNextId(),
                                qty: -split.quantity,
                            });
                            this.addOrderline(originalOrder, decreaseLine);
                        }
                    }
                }
                // for the kitchen printer we assume that everything
                // has already been sent to the kitchen before splitting
                // the bill. So we save all changes both for the old
                // order and for the new one. This is not entirely correct
                // but avoids flooding the kitchen with unnecessary orders.
                // Not sure what to do in this case.
                // TODO jcb
                // if (newOrder._saveResumeChanges) {
                //     this.currentOrder._saveResumeChanges();
                //     newOrder._saveResumeChanges();
                // }
                this.actionSetCustomerCount(newOrder, 1);
                const newCustomerCount =
                    this.floatCompare(originalOrder.customer_count - 1, 0, 5) === 0
                        ? 1
                        : originalOrder.customer_count - 1;
                this.actionSetCustomerCount(originalOrder, newCustomerCount);
                await this.actionSelectOrder(newOrder);
            }
            delete newOrder._extras.temporary;
            await this.actionShowScreen('PaymentScreen');
        },
        async actionPrintResumeChanges(order) {
            if (this.hasResumeChangesToPrint(order)) {
                let isPrintSuccessful = true;
                let errorMessage;
                for (const printer of this.data.derived.printers) {
                    const changes = this._computeResumeChanges(order, printer.config.product_categories_ids);
                    if (changes['new'].length > 0 || changes['cancelled'].length > 0) {
                        const receipt = qweb.render('OrderChangeReceipt', { changes: changes, widget: this });
                        const result = await printer.print_receipt(receipt);
                        if (!result.successful) {
                            isPrintSuccessful = false;
                            errorMessage = result.message;
                        }
                    }
                }
                if (isPrintSuccessful) {
                    this._saveResumeChanges(order);
                } else {
                    await this.ui.askUser('ErrorPopup', errorMessage);
                }
            }
        },
        getTableOrders(table) {
            if (!table) {
                return this.getDraftOrders();
            }
            return this.getDraftOrders().filter((order) => order.table_id === table.id);
        },
        getOrderCount(table) {
            return this.getTableOrders(table).length;
        },
        getTable(order) {
            if (order.table_id) {
                const table = this.getRecord('restaurant.table', order.table_id);
                const floor = this.getRecord('restaurant.floor', table.floor_id);
                return `${floor.name} (${table.name})`;
            } else {
                return '';
            }
        },
        getActiveTable() {
            return this.getRecord('restaurant.table', this.data.uiState.activeTableId);
        },
        getActiveFloor() {
            return this.getRecord('restaurant.floor', this.data.uiState.activeFloorId);
        },
        /**
         * Returns total number of customers in a table.
         * @param {'restaurant.table'} table
         */
        getTotalNumberCustomers(table) {
            return sum(this.getTableOrders(table), (order) => order.customer_count || 0);
        },
        getOrderFloor(order) {
            const table = this.getRecord('restaurant.table', order.table_id);
            return this.getRecord('restaurant.floor', table.floor_id);
        },

        //#region FloorScreen

        getSelectedTable() {
            return this.getRecord('restaurant.table', this.data.uiState.FloorScreen.selectedTableId);
        },
        _getNewTableName(name) {
            if (name) {
                const num = Number((name.match(/\d+/g) || [])[0] || 0);
                const str = name.replace(/\d+/g, '');
                const n = { num: num, str: str };
                n.num += 1;
                this._lastName = n;
            } else if (this._lastName) {
                this._lastName.num += 1;
            } else {
                this._lastName = { num: 1, str: 'T' };
            }
            return '' + this._lastName.str + this._lastName.num;
        },
        async saveTableToServer(table) {
            if (!table) return;
            try {
                const tableId = await this._rpc({
                    model: 'restaurant.table',
                    method: 'create_from_ui',
                    args: [table],
                });
                table.id = tableId;
                if (table.active) {
                    this.setRecord('restaurant.table', table.id, table);
                } else {
                    this.deleteRecord('restaurant.table', table.id);
                }
            } catch (error) {
                if (error instanceof Error) throw error;
                if (error?.message.code < 0) {
                    await this.ui.askUser('ErrorPopup', {
                        title: _t('Offline'),
                        body: _t('Unable to create/edit/delete table because you are offline.'),
                    });
                }
            }
        },
        actionToggleEditMode() {
            this.data.uiState.FloorScreen.isEditMode = !this.data.uiState.FloorScreen.isEditMode;
            this.data.uiState.FloorScreen.selectedTableId = false;
        },
        async actionCreateTable(floor) {
            const newTable = {
                position_v: 100,
                position_h: 100,
                width: 75,
                height: 75,
                shape: 'square',
                seats: 1,
                name: this._getNewTableName(),
                floor_id: floor.id,
                active: true,
            };
            await this.saveTableToServer(newTable);
            this.updateRecord('restaurant.floor', floor.id, { table_ids: [...floor.table_ids, newTable.id] });
            this.data.uiState.FloorScreen.selectedTableId = newTable.id;
        },
        async actionDuplicateTable(table) {
            const newTable = Object.assign({}, table);
            newTable.position_h += 10;
            newTable.position_v += 10;
            newTable.name = this._getNewTableName(newTable.name);
            delete newTable.id;
            await this.saveTableToServer(newTable);
            const floor = this.getRecord('restaurant.floor', table.floor_id);
            this.updateRecord('restaurant.floor', floor.id, { table_ids: [...floor.table_ids, newTable.id] });
            this.data.uiState.FloorScreen.selectedTableId = newTable.id;
        },
        async actionUpdateTable(table, vals) {
            this.updateRecord('restaurant.table', table.id, vals);
            if ('active' in vals && !vals.active) {
                this.data.uiState.FloorScreen.selectedTableId = false;
            }
            await this.saveTableToServer(table);
        },
        async actionDeleteTable(table) {
            const ordersInTable = this.getDraftOrders().filter((order) => order.table_id === table.id);
            if (ordersInTable.length) {
                this.ui.askUser('ErrorPopup', {
                    title: _t('Unable to delete table.'),
                    body: _t('There are orders linked to this table. Clear the table from orders before deleting.'),
                });
                return;
            }
            await this.saveTableToServer({ id: table.id, active: false });
            const floor = this.getRecord('restaurant.floor', table.floor_id);
            this.updateRecord('restaurant.floor', floor.id, {
                table_ids: floor.table_ids.filter((id) => id !== table.id),
            });
            this.deleteRecord('restaurant.table', table.id);
        },
        async actionUpdateFloor(floor, vals) {
            this.updateRecord('restaurant.floor', floor.id, vals);
            try {
                await this._rpc({
                    model: 'restaurant.floor',
                    method: 'write',
                    args: [[floor.id], vals],
                });
            } catch (error) {
                if (error instanceof Error) throw error;
                if (error.message.code < 0) {
                    this.ui.showNotification(_t('Unable to save changes to the server.'));
                    // TODO jcb: is showing toast notification better than showing error?
                    // await this.ui.askUser('OfflineErrorPopup', {
                    //     title: _t('Offline'),
                    //     body: _t('Unable to save changes to the server.'),
                    // });
                }
            }
        },

        //#endregion FloorScreen

        //#region ORDER SYNCING

        actionDeleteOrder(order) {
            this._super(...arguments);
            this._setOrderIdsToRemove([order]);
        },
        async actionExitTable(table) {
            if (table) {
                const floor = this.getRecord('restaurant.table', table.floor_id);
                await this._syncToServer(table);
                await this.actionSetFloor(floor);
            } else {
                await this.actionShowScreen('FloorScreen');
            }
        },
        _setOrderIdsToRemove(orders) {
            for (const order of orders) {
                if (!order._extras.server_id) continue;
                this.data.uiState.orderIdsToRemove.add(order._extras.server_id);
            }
        },
        _deleteOrderIdsToRemove(orderIds) {
            for (const orderId of orderIds) {
                this.data.uiState.orderIdsToRemove.delete(orderId);
            }
        },
        _getOrderIdsToRemove() {
            return [...this.data.uiState.orderIdsToRemove];
        },
        /**
         * Save to server given draft orders.
         * @param {'pos.order'[]} orders
         */
        async _saveDraftOrders(orders) {
            try {
                await this._pushOrders(orders, true);
            } catch (error) {
                if (error instanceof Error) throw error;
                if (error?.message.code < 0) {
                    console.error(error);
                }
            }
        },
        async _removeDeletedOrders(orderIds) {
            if (!orderIds.length) return;
            const deletedOrderIds = await this._rpc({
                model: 'pos.order',
                method: 'remove_from_ui',
                args: [orderIds],
            });
            this._deleteOrderIdsToRemove(deletedOrderIds);
        },
        async _syncToServer(table) {
            const orders = this.getDraftOrders().filter((order) => order.table_id === table.id);
            await this._saveDraftOrders(orders);
            await this._removeDeletedOrders(this._getOrderIdsToRemove());
        },
        /**
         * Get from server the updated orders of the given table.
         * @param {number} tableId
         */
        async _syncFromServer(table) {
            const { data } = await this._rpc({
                model: 'pos.order',
                method: 'get_table_draft_orders',
                args: [table.id],
            });
            for (const order of this.getTableOrders(table).filter((order) => !order._extras.validationDate)) {
                this.deleteOrder(order.id);
            }
            this._loadOrders(data);
        },
        _loadOrders(data) {
            let extras = {};
            for (const model in data) {
                for (const record of data[model]) {
                    if (model === 'pos.order') {
                        const uid = record.pos_reference.match(/\d{5,}-\d{3,}-\d{4,}/);
                        extras = this._defaultOrderExtras(uid ? uid[0] : record.id);
                        extras.server_id = record.id;
                    }
                    this.setRecord(model, record.id, record, extras);
                    extras = {};
                }
            }
        },

        //#endregion ORDER SYNCING

        canBeAdjusted(payment) {
            const paymentTerminal = this.getPaymentTerminal(payment.payment_method_id);
            if (paymentTerminal) {
                return paymentTerminal.canBeAdjusted(payment.id);
            }
            const paymentMethod = this.getRecord('pos.payment.method', payment.payment_method_id);
            return !paymentMethod.is_cash_count;
        },
        async actionSendPaymentAdjust(order, payment) {
            const paymentMethod = this.getRecord('pos.payment.method', payment.payment_method_id);
            const previousAmount = payment.amount;
            const { withTaxWithDiscount } = this.getOrderTotals(order);
            const amountPaid = this.getPaymentsTotalAmount(order);
            const amountDiff = withTaxWithDiscount - amountPaid;
            // if amountDiff is zero, do nothing.
            if (this.floatCompare(amountDiff, 0, 5) == 0) return;
            this.actionUpdatePayment(payment, { amount: previousAmount + amountDiff });
            await this.actionHandler({ name: 'actionSetPaymentStatus', args: [payment, 'waiting'] });
            const paymentTerminal = this.getPaymentTerminal(paymentMethod.id);
            const isAdjustSuccessful = await paymentTerminal.send_payment_adjust(payment.id);
            if (!isAdjustSuccessful) {
                this.actionUpdatePayment(payment, { amount: previousAmount });
            }
            this.actionSetPaymentStatus(payment, 'done');
        },
        _defaultOrderExtras(uid) {
            const result = this._super(...arguments);
            result.TipScreen = {
                inputTipAmount: '',
            };
            return result;
        },
        async actionValidateTip(order, amount, nextScreen) {
            const serverId = order._extras.server_id;
            if (this.floatCompare(amount, 0) === 0) {
                await this._rpc({
                    method: 'set_no_tip',
                    model: 'pos.order',
                    args: [serverId],
                });
                return this.actionOrderDone(order, nextScreen);
            }

            const { withTaxWithDiscount } = this.getOrderTotals(order);
            if (this.floatCompare(amount, 0.25 * withTaxWithDiscount) > 0) {
                const msg = _t("%s is more than 25% of the order's total amount. Are you sure of this tip amount?");
                const confirmed = await this.ui.askUser('ConfirmPopup', {
                    title: _t('Are you sure?'),
                    body: _.str.sprintf(msg, this.formatCurrency(amount)),
                });
                if (!confirmed) return;
            }

            const tipLine = await this._setTip(order, amount);

            const payments = this.getPayments(order);
            const mainPayment = payments[0];
            const paymentTerminal = this.getPaymentTerminal(mainPayment.payment_method_id);
            if (paymentTerminal) {
                this.actionUpdatePayment(mainPayment, { amount: mainPayment.amount + amount });
                await paymentTerminal.send_payment_adjust(mainPayment.id);
            }

            if (tipLine) {
                await this._rpc({
                    method: 'set_tip',
                    model: 'pos.order',
                    args: [serverId, this.getOrderlineJSON(tipLine)],
                });
            }
            await this.actionOrderDone(order, nextScreen);
        },
        async actionSettleTips(ordersToTip) {
            const activeOrder = this.getActiveOrder();
            // set tip in each order
            for (const order of ordersToTip) {
                const tipAmount = parse.float(order._extras.TipScreen.inputTipAmount);
                if (!order._extras.server_id) {
                    console.warn(
                        `${this.getOrderName(order)} is not yet sync. Sync it to server before setting a tip.`
                    );
                } else {
                    const result = await this._settleTip(order, tipAmount);
                    if (!result) break;
                }
            }
            if (this.exists(activeOrder.id)) {
                this.data.uiState.activeOrderId = activeOrder.id;
            } else {
                const orders = this.getDraftOrders();
                if (orders.length) {
                    this.data.uiState.activeOrderId = orders[0].id;
                }
            }
        },
        async _settleTip(order, amount) {
            try {
                const payment = this.getPayments(order)[0];
                const paymentTerminal = this.getPaymentTerminal(payment.payment_method_id);
                if (paymentTerminal) {
                    payment.amount += amount;
                    // temporarily set the activeOrder
                    this.data.uiState.activeOrderId = order.id;
                    await paymentTerminal.send_payment_adjust(payment.id);
                }

                if (this.floatCompare(amount, 0) === 0) {
                    await this._rpc({
                        method: 'set_no_tip',
                        model: 'pos.order',
                        args: [order._extras.server_id],
                    });
                } else {
                    const tipLine = await this._setTip(order, amount);
                    await this._rpc({
                        method: 'set_tip',
                        model: 'pos.order',
                        args: [order._extras.server_id, this.getOrderlineJSON(tipLine)],
                    });
                }
                this._tryDeleteOrder(order);
                return true;
            } catch (error) {
                const msgTemplate = _t(
                    'Failed to set tip to %s. Do you want to proceed on setting the tips of the remaining?'
                );
                const confirmed = await this.ui.askUser('ConfirmPopup', {
                    title: _t('Failed to set tip'),
                    body: _.str.sprintf(msgTemplate, this.getOrderName(order)),
                });
                return confirmed;
            }
        },

        //#region AUTO_BACK_TO_FLOORSCREEN

        _setActivityListeners() {
            const nonIdleEvents = [
                'mousemove',
                'mousedown',
                'touchstart',
                'touchend',
                'touchmove',
                'click',
                'scroll',
                'keypress',
            ];
            for (const event of nonIdleEvents) {
                window.addEventListener(event, () => this._setIdleTimer());
            }
        },
        _setIdleTimer() {
            if (this._shouldResetIdleTimer()) {
                clearTimeout(this.idleTimer);
                this.idleTimer = setTimeout(async () => {
                    await this.actionHandler({ name: 'actionExitTable', args: [this.getActiveTable()] });
                }, 60000);
            }
        },
        _shouldResetIdleTimer() {
            return this.ifaceFloorplan && this.getActiveScreen() !== 'FloorScreen';
        },

        //#endregion
    });
});
