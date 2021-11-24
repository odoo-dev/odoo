odoo.define('point_of_sale.custom_hooks', function (require) {
    'use strict';

    const { Component } = owl;
    const { onMounted, onPatched, onWillUnmount } = owl;

    /**
     * Introduce error handlers in the component.
     *
     * IMPROVEMENT: This is a terrible hook. There could be a better way to handle
     * the error when the order failed to sync.
     */
    function useErrorHandlers() {
        const component = Component.current;

        component._handlePushOrderError = async function (error) {
            // This error handler receives `error` equivalent to `error.message` of the rpc error.
            if (error.message === 'Backend Invoice') {
                await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Please print the invoice from the backend'),
                    body:
                        this.env._t(
                            'The order has been synchronized earlier. Please make the invoice from the backend for the order: '
                        ) + error.data.order.name,
                });
            } else if (error.code < 0) {
                // XmlHttpRequest Errors
                const title = this.env._t('Unable to sync order');
                const body = this.env._t(
                    'Check the internet connection then try to sync again by clicking on the red wifi button (upper right of the screen).'
                );
                await this.showPopup('OfflineErrorPopup', { title, body });
            } else if (error.code === 200) {
                // OpenERP Server Errors
                await this.showPopup('ErrorTracebackPopup', {
                    title: error.data.message || this.env._t('Server Error'),
                    body:
                        error.data.debug ||
                        this.env._t('The server encountered an error while receiving your order.'),
                });
            } else if (error.code === 700) {
                // Fiscal module errors
                await this.showPopup('ErrorPopup', {
                    title: this.env._t('Fiscal data module error'),
                    body:
                        error.data.error.status ||
                        this.env._t('The fiscal data module encountered an error while receiving your order.'),
                });
            } else {
                // ???
                await this.showPopup('ErrorPopup', {
                    title: this.env._t('Unknown Error'),
                    body: this.env._t(
                        'The order could not be sent to the server due to an unknown error'
                    ),
                });
            }
        };
    }

    function useAutoFocusToLast() {
        const current = Component.current;
        let target = null;
        function autofocus() {
            const prevTarget = target;
            const allInputs = current.el.querySelectorAll('input');
            target = allInputs[allInputs.length - 1];
            if (target && target !== prevTarget) {
                target.focus();
                target.selectionStart = target.selectionEnd = target.value.length;
            }
        }
        onMounted(autofocus);
        onPatched(autofocus);
    }

    /**
     * Use this hook when you want to do something on previously selected and
     * newly selected order when the order changes.
     *
     * Normally, a component is rendered then the current order is changed. When
     * this happens, we want to rerender the component because the new information
     * should be reflected in the screen. Additionally, we might want to remove listeners
     * to the previous order and attach listeners to the new one. This hook is
     * perfect for the described situation.
     *
     * Internally, this hook performs the following:
     * 1. call newOrderCB on mounted
     * 2. listen to order changes and perform the following sequence:
     *    - call prevOrderCB(prevOrder)
     *    - call newOrderCB(newOrder)
     * 3. call prevOrderCB on willUnmount
     *
     * @param {Function} prevOrderCB apply this callback on the previous order
     * @param {Function} newOrderCB apply this callback on the new order
     */
    function onChangeOrder(prevOrderCB, newOrderCB) {
        const current = Component.current;
        prevOrderCB = prevOrderCB ? prevOrderCB.bind(current) : () => {};
        newOrderCB = newOrderCB ? newOrderCB.bind(current) : () => {};
        onMounted(() => {
            current.env.pos.on(
                'change:selectedOrder',
                async (pos, newOrder) => {
                    await prevOrderCB(pos.previous('selectedOrder'));
                    await newOrderCB(newOrder);
                },
                current
            );
            newOrderCB(current.env.pos.get_order());
        });
        onWillUnmount(() => {
            current.env.pos.off('change:selectedOrder', null, current);
            prevOrderCB(current.env.pos.get_order());
        });
    }

    function useBarcodeReader(callbackMap, exclusive = false) {
        const current = Component.current;
        const barcodeReader = current.env.pos.barcode_reader;
        for (let [key, callback] of Object.entries(callbackMap)) {
            callbackMap[key] = callback.bind(current);
        }
        onMounted(() => {
            if (barcodeReader) {
                for (let key in callbackMap) {
                    if (exclusive) {
                        barcodeReader.set_exclusive_callback(key, callbackMap[key]);
                    } else {
                        barcodeReader.set_action_callback(key, callbackMap[key]);
                    }
                }
            }
        });
        onWillUnmount(() => {
            if (barcodeReader) {
                for (let key in callbackMap) {
                    if (exclusive) {
                        barcodeReader.remove_exclusive_callback(key, callbackMap[key]);
                    } else {
                        barcodeReader.remove_action_callback(key, callbackMap[key]);
                    }
                }
            }
        });
    }

    return { useErrorHandlers, useAutoFocusToLast, onChangeOrder, useBarcodeReader };
});
