/* @odoo-module */

import devices from 'point_of_sale.devices';
import BarcodeReader from 'point_of_sale.BarcodeReader';

// TODO-REF: Move here posbus and posMutex from `point_of_sale.utils`.
export const proxy_queue = new devices.JobQueue();           // used to prevent parallels communications to the proxy
export const proxy = new devices.ProxyDevice();              // used to communicate to the hardware devices via a local proxy
export const barcode_reader = new BarcodeReader({ proxy });
