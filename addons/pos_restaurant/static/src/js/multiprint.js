odoo.define('pos_restaurant.multiprint', function (require) {
"use strict";

var models = require('point_of_sale.models');
var core = require('web.core');
var Printer = require('point_of_sale.Printer').Printer;
const Registries = require('point_of_sale.Registries');

var QWeb = core.qweb;

Registries.PosModelRegistry.extend(models.PosModel, (PosModel) => {

class PosResMultiprintPosModel extends PosModel {
    create_printer(config) {
        var url = config.proxy_ip || '';
        if(url.indexOf('//') < 0) {
            url = window.location.protocol + '//' + url;
        }
        if(url.indexOf(':', url.indexOf('//') + 2) < 0 && window.location.protocol !== 'https:') {
            url = url + ':8069';
        }
        return new Printer(url, this);
    }
}

return PosResMultiprintPosModel;
});

models.load_models({
    model: 'restaurant.printer',
    loaded: function(self,printers){
        var active_printers = {};
        for (var i = 0; i < self.config.printer_ids.length; i++) {
            active_printers[self.config.printer_ids[i]] = true;
        }

        self.printers = [];
        self.printers_categories = {}; // list of product categories that belong to
                                       // one or more order printer

        for(var i = 0; i < printers.length; i++){
            if(active_printers[printers[i].id]){
                var printer = self.create_printer(printers[i]);
                printer.config = printers[i];
                self.printers.push(printer);

                for (var j = 0; j < printer.config.product_categories_ids.length; j++) {
                    self.printers_categories[printer.config.product_categories_ids[j]] = true;
                }
            }
        }
        self.printers_categories = _.keys(self.printers_categories);
        self.config.iface_printers = !!self.printers.length;
    },
});

Registries.PosModelRegistry.extend(models.Orderline, (Orderline) => {

class PosResMultiprintOrderline extends Orderline {
    initialize() {
        super.initialize(...arguments);
        if (!this.pos.config.iface_printers) {
            return;
        }
        if (typeof this.mp_dirty === 'undefined') {
            // mp dirty is true if this orderline has changed
            // since the last kitchen print
            // it's left undefined if the orderline does not
            // need to be printed to a printer.

            this.mp_dirty = this.printable() || undefined;
        }
        if (!this.mp_skip) {
            // mp_skip is true if the cashier want this orderline
            // not to be sent to the kitchen
            this.mp_skip  = false;
        }
    }
    // can this orderline be potentially printed ?
    printable() {
        return this.pos.db.is_product_in_category(this.pos.printers_categories, this.get_product().id);
    }
    init_from_JSON(json) {
        super.init_from_JSON(...arguments);
        this.mp_dirty = json.mp_dirty;
        this.mp_skip  = json.mp_skip;
    }
    export_as_JSON() {
        var json = super.export_as_JSON(...arguments);
        json.mp_dirty = this.mp_dirty;
        json.mp_skip  = this.mp_skip;
        return json;
    }
    set_quantity(quantity) {
        if (this.pos.config.iface_printers && quantity !== this.quantity && this.printable()) {
            this.mp_dirty = true;
        }
        return super.set_quantity(...arguments);
    }
    can_be_merged_with(orderline) {
        return (!this.mp_skip) &&
               (!orderline.mp_skip) &&
               super.can_be_merged_with(...arguments);
    }
    set_skip(skip) {
        if (this.mp_dirty && skip && !this.mp_skip) {
            this.mp_skip = true;
        }
        if (this.mp_skip && !skip) {
            this.mp_dirty = true;
            this.mp_skip  = false;
        }
    }
    set_dirty(dirty) {
        if (this.mp_dirty !== dirty) {
            this.mp_dirty = dirty;
        }
    }
    get_line_diff_hash(){
        if (this.get_note()) {
            return this.id + '|' + this.get_note();
        } else {
            return '' + this.id;
        }
    }
}

return PosResMultiprintOrderline;
});

Registries.PosModelRegistry.extend(models.Order, (Order) => {

class PosResMultiprintOrder extends Order {
    build_line_resume(){
        var resume = {};
        this.orderlines.getItems().forEach(function(line){
            if (line.mp_skip) {
                return;
            }
            var qty  = Number(line.get_quantity());
            var note = line.get_note();
            var product_id = line.get_product().id;
            var product_resume = product_id in resume ? resume[product_id] : {
                product_name_wrapped: line.generate_wrapped_product_name(),
                qties: {},
            };
            if (note in product_resume['qties']) product_resume['qties'][note] += qty;
            else product_resume['qties'][note] = qty;
            resume[product_id] = product_resume;
        });
        return resume;
    }
    saveChanges(){
        this.saved_resume = this.build_line_resume();
        this.orderlines.getItems().forEach(function(line){
            line.set_dirty(false);
        });
    }
    computeChanges(categories){
        var current_res = this.build_line_resume();
        var old_res     = this.saved_resume || {};
        var json        = this.export_as_JSON();
        var add = [];
        var rem = [];
        var pid, note;

        for (pid in current_res) {
            for (note in current_res[pid]['qties']) {
                var curr = current_res[pid];
                var old  = old_res[pid] || {};
                var found = pid in old_res && note in old_res[pid]['qties'];

                if (!found) {
                    add.push({
                        'id':       pid,
                        'name':     this.pos.db.get_product_by_id(pid).display_name,
                        'name_wrapped': curr.product_name_wrapped,
                        'note':     note,
                        'qty':      curr['qties'][note],
                    });
                } else if (old['qties'][note] < curr['qties'][note]) {
                    add.push({
                        'id':       pid,
                        'name':     this.pos.db.get_product_by_id(pid).display_name,
                        'name_wrapped': curr.product_name_wrapped,
                        'note':     note,
                        'qty':      curr['qties'][note] - old['qties'][note],
                    });
                } else if (old['qties'][note] > curr['qties'][note]) {
                    rem.push({
                        'id':       pid,
                        'name':     this.pos.db.get_product_by_id(pid).display_name,
                        'name_wrapped': curr.product_name_wrapped,
                        'note':     note,
                        'qty':      old['qties'][note] - curr['qties'][note],
                    });
                }
            }
        }

        for (pid in old_res) {
            for (note in old_res[pid]['qties']) {
                var found = pid in current_res && note in current_res[pid]['qties'];
                if (!found) {
                    var old = old_res[pid];
                    rem.push({
                        'id':       pid,
                        'name':     this.pos.db.get_product_by_id(pid).display_name,
                        'name_wrapped': old.product_name_wrapped,
                        'note':     note,
                        'qty':      old['qties'][note],
                    });
                }
            }
        }

        if(categories && categories.length > 0){
            // filter the added and removed orders to only contains
            // products that belong to one of the categories supplied as a parameter

            var self = this;

            var _add = [];
            var _rem = [];

            for(var i = 0; i < add.length; i++){
                if(self.pos.db.is_product_in_category(categories,add[i].id)){
                    _add.push(add[i]);
                }
            }
            add = _add;

            for(var i = 0; i < rem.length; i++){
                if(self.pos.db.is_product_in_category(categories,rem[i].id)){
                    _rem.push(rem[i]);
                }
            }
            rem = _rem;
        }

        var d = new Date();
        var hours   = '' + d.getHours();
            hours   = hours.length < 2 ? ('0' + hours) : hours;
        var minutes = '' + d.getMinutes();
            minutes = minutes.length < 2 ? ('0' + minutes) : minutes;

        return {
            'new': add,
            'cancelled': rem,
            'table': json.table || false,
            'floor': json.floor || false,
            'name': json.name  || 'unknown order',
            'time': {
                'hours':   hours,
                'minutes': minutes,
            },
        };

    }
    async printChanges(){
        var printers = this.pos.printers;
        let isPrintSuccessful = true;
        for(var i = 0; i < printers.length; i++){
            var changes = this.computeChanges(printers[i].config.product_categories_ids);
            if ( changes['new'].length > 0 || changes['cancelled'].length > 0){
                var receipt = QWeb.render('OrderChangeReceipt',{changes:changes, widget:this});
                const result = await printers[i].print_receipt(receipt);
                if (!result.successful) {
                    isPrintSuccessful = false;
                }
            }
        }
        return isPrintSuccessful;
    }
    hasChangesToPrint(){
        var printers = this.pos.printers;
        for(var i = 0; i < printers.length; i++){
            var changes = this.computeChanges(printers[i].config.product_categories_ids);
            if ( changes['new'].length > 0 || changes['cancelled'].length > 0){
                return true;
            }
        }
        return false;
    }
    hasSkippedChanges() {
        var orderlines = this.get_orderlines();
        for (var i = 0; i < orderlines.length; i++) {
            if (orderlines[i].mp_skip) {
                return true;
            }
        }
        return false;
    }
    export_as_JSON(){
        var json = super.export_as_JSON(...arguments);
        json.multiprint_resume = JSON.stringify(this.saved_resume);
        return json;
    }
    init_from_JSON(json){
        super.init_from_JSON(...arguments);
        this.saved_resume = json.multiprint_resume && JSON.parse(json.multiprint_resume);
    }
}

return PosResMultiprintOrder;
});


});
