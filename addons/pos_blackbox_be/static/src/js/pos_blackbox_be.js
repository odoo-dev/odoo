odoo.define('pos_blackbox_be.pos_blackbox_be', function (require) {
    var core    = require('web.core');
    var screens = require('point_of_sale.screens');
    var models = require('point_of_sale.models');
    var devices = require('point_of_sale.devices');
    var chrome = require('point_of_sale.chrome');
    var gui = require('point_of_sale.gui');
    var Class = require('web.Class');
    var utils = require('web.utils');
    var PosBaseWidget = require('point_of_sale.BaseWidget');

    var _t      = core._t;
    var round_pr = utils.round_precision;

    var orderline_super = models.Orderline.prototype;
    models.Orderline = models.Orderline.extend({
        // generates a table of the form
        // {..., 'char_to_translate': translation_of_char, ...}
        _generate_translation_table: function () {
            var replacements = [
                ["ÄÅÂÁÀâäáàã", "A"],
                ["Ææ", "AE"],
                ["ß", "SS"],
                ["çÇ", "C"],
                ["ÎÏÍÌïîìí", "I"],
                ["€", "E"],
                ["ÊËÉÈêëéè", "E"],
                ["ÛÜÚÙüûúù", "U"],
                ["ÔÖÓÒöôóò", "O"],
                ["Œœ", "OE"],
                ["ñÑ", "N"],
                ["ýÝÿ", "Y"]
            ];

            var lowercase_to_uppercase = _.range("a".charCodeAt(0), "z".charCodeAt(0) + 1).map(function (lowercase_ascii_code) {
                return [String.fromCharCode(lowercase_ascii_code), String.fromCharCode(lowercase_ascii_code).toUpperCase()];
            });
            replacements = replacements.concat(lowercase_to_uppercase);

            var lookup_table = {};

            _.forEach(replacements, function (letter_group) {
                _.forEach(letter_group[0], function (special_char) {
                    lookup_table[special_char] = letter_group[1];
                });
            });

            return lookup_table;
        },

        _replace_hash_and_sign_chars: function (str) {
            if (typeof str !== 'string') {
                throw "Can only handle strings";
            }

            var translation_table = this._generate_translation_table();

            var replaced_char_array = _.map(str, function (char, index, str) {
                var translation = translation_table[char];
                if (translation) {
                    return translation;
                } else {
                    return char;
                }
            });

            return replaced_char_array.join("");
        },

        // for hash and sign the allowed range for DATA is:
        //   - A-Z
        //   - 0-9
        // and SPACE as well. We filter SPACE out here though, because
        // SPACE will only be used in DATA of hash and sign as description
        // padding
        _filter_allowed_hash_and_sign_chars: function (str) {
            if (typeof str !== 'string') {
                throw "Can only handle strings";
            }

            var filtered_char_array = _.filter(str, function (char) {
                var ascii_code = char.charCodeAt(0);

                if ((ascii_code >= "A".charCodeAt(0) && ascii_code <= "Z".charCodeAt(0)) ||
                    (ascii_code >= "0".charCodeAt(0) && ascii_code <= "9".charCodeAt(0))) {
                    return true;
                } else {
                    return false;
                }
            });

            return filtered_char_array.join("");
        },

        // for both amount and price
        // price should be in eurocent
        // amount should be in gram
        _prepare_number_for_plu: function (number, field_length) {
            number = Math.abs(number);
            number = Math.round(number); // todo jov: don't like this

            var number_string = number.toFixed(0);

            number_string = this._replace_hash_and_sign_chars(number_string);
            number_string = this._filter_allowed_hash_and_sign_chars(number_string);

            // get the required amount of least significant characters
            number_string = number_string.substr(-field_length);

            // pad left with 0 to required size
            while (number_string.length < field_length) {
                number_string = "0" + number_string;
            }

            return number_string;
        },

        _prepare_description_for_plu: function (description) {
            description = this._replace_hash_and_sign_chars(description);
            description = this._filter_allowed_hash_and_sign_chars(description);

            // get the 20 most significant characters
            description = description.substr(0, 20);

            // pad right with SPACE to required size of 20
            while (description.length < 20) {
                description = description + " ";
            }

            return description;
        },

        _get_amount_for_plu: function () {
            // three options:
            // 1. unit => need integer
            // 2. weight => need integer gram
            // 3. volume => need integer milliliter

            var amount = this.get_quantity();
            var uom = this.get_unit();

            if (uom.is_unit) {
                return amount;
            } else {
                if (uom.category_id[1] === "Weight") {
                    var uom_gram = _.find(this.pos.units_by_id, function (unit) {
                        return unit.category_id[1] === "Weight" && unit.name === "g";
                    });
                    amount = (amount / uom.factor) * uom_gram.factor;
                } else if (uom.category_id[1] === "Volume") {
                    var uom_milliliter = _.find(this.pos.units_by_id, function (unit) {
                        return unit.category_id[1] === "Volume" && unit.name === "Milliliter(s)";
                    });
                    amount = (amount / uom.factor) * uom_milliliter.factor;
                }

                return amount;
            }
        },

        get_vat_letter: function () {
            var taxes = this.get_taxes()[0];
            var line_name = this.get_product().display_name;

            if (! taxes) {
                throw new Error("FDM error: " + line_name + " has no tax associated with it.");
            }

            var vat_letter = taxes.identification_letter;

            if (! vat_letter) {
                throw new Error("FDM error: " + line_name + " has an invalid tax amount. Only 21%, 12%, 6% and 0% are allowed.");
            }

            return vat_letter;
        },

        generate_plu_line: function () {
            // |--------+-------------+-------+-----|
            // | AMOUNT | DESCRIPTION | PRICE | VAT |
            // |      4 |          20 |     8 |   1 |
            // |--------+-------------+-------+-----|

            // steps:
            // 1. replace all chars
            // 2. filter out forbidden chars
            // 3. build PLU line

            var amount = this._get_amount_for_plu();
            var description = this.get_product().display_name;
            var price_in_eurocent = this.get_display_price() * 100;
            var vat_letter = this.get_vat_letter();

            amount = this._prepare_number_for_plu(amount, 4);
            description = this._prepare_description_for_plu(description);
            price_in_eurocent = this._prepare_number_for_plu(price_in_eurocent, 8);

            return amount + description + price_in_eurocent + vat_letter;
        },

        can_be_merged_with: function (orderline) {
            if (this.blackbox_pro_forma_finalized || orderline.blackbox_pro_forma_finalized) {
                return false;
            } else {
                return orderline_super.can_be_merged_with.apply(this, arguments);
            }
        },

        _show_finalized_error: function () {
            this.pos.gui.show_popup("error", {
                'title': _t("Order error"),
                'body':  _t("This orderline has already been finalized in a pro forma order and \
can no longer be modified. Please create a new line with eg. a negative quantity."),
            });
        },

        set_discount: function (discount) {
            if (this.blackbox_pro_forma_finalized) {
                this._show_finalized_error();
            } else {
                orderline_super.set_discount.apply(this, arguments);
            }
        },

        set_unit_price: function (price) {
            if (this.blackbox_pro_forma_finalized) {
                this._show_finalized_error();
            } else {
                orderline_super.set_unit_price.apply(this, arguments);
            }
        },

        set_quantity: function (quantity, no_decrease) {
            var current_quantity = this.get_quantity();
            var future_quantity = parseFloat(quantity) || 0;

            if (no_decrease && (future_quantity === 0 || future_quantity < current_quantity)) {
                this.pos.gui.show_popup("number", {
                    'title': _t("Decrease the quantity by"),
                    'confirm': function (qty_decrease) {
                        if (qty_decrease) {
                            var order = this.pos.get_order();
                            var selected_orderline = order.get_selected_orderline();
                            qty_decrease = parseInt(qty_decrease, 10);

                            // We have to prevent taking back more than what was on the order. The
                            // right way to do this is by "merging" all the orderlines that we can
                            // with this one (including previous decreases). Then we can figure out
                            // how much the POS user can still decrease by.
                            var current_total_quantity_remaining = selected_orderline.get_quantity();
                            order.get_orderlines().forEach(function (orderline, index, array) {
                                if (selected_orderline.id != orderline.id &&
                                    selected_orderline.get_product().id === orderline.get_product().id &&
                                    selected_orderline.get_discount() === orderline.get_discount()) {
                                    current_total_quantity_remaining += orderline.get_quantity();
                                }
                            });

                            if (qty_decrease > current_total_quantity_remaining) {
                                this.pos.gui.show_popup("error", {
                                    'title': _t("Order error"),
                                    'body':  _t("Not allowed to take back more than was ordered."),
                                });
                            } else {
                                var decrease_line = order.get_selected_orderline().clone();
                                decrease_line.order = order;
                                decrease_line.set_quantity(-qty_decrease);
                                order.add_orderline(decrease_line);
                            }
                        }
                    }
                });
            } else {
                orderline_super.set_quantity.apply(this, arguments);
            }
        },

        init_from_JSON: function (json) {
            orderline_super.init_from_JSON.apply(this, arguments);
            this.blackbox_pro_forma_finalized = json.blackbox_pro_forma_finalized;
        },

        export_as_JSON: function () {
            var json = orderline_super.export_as_JSON.apply(this, arguments);

            return _.extend(json, {
                'vat_letter': this.get_vat_letter(),
                'blackbox_pro_forma_finalized': this.blackbox_pro_forma_finalized
            });
        },

        export_for_printing: function () {
            var json = orderline_super.export_for_printing.apply(this, arguments);

            return _.extend(json, {
                'vat_letter': this.get_vat_letter()
            });
        }
    });

    screens.OrderWidget.include({
        set_value: function (val) {
            var order = this.pos.get_order();
            var mode = this.numpad_state.get('mode');

            if (order.get_selected_orderline() && mode === 'quantity') {
                order.get_selected_orderline().set_quantity(val, "dont_allow_decreases");
            } else {
                this._super(val);
            }
        },

        update_summary: function () {
            if (this.pos.get_order()) {
                return this._super();
            }
        }
    });

    var order_model_super = models.Order.prototype;
    models.Order = models.Order.extend({
        // we need to patch export_as_JSON because that's what's used
        // when sending orders to backend
        export_as_JSON: function () {
            var json = order_model_super.export_as_JSON.bind(this)();

            var to_return = _.extend(json, {
                'blackbox_date': this.blackbox_date,
                'blackbox_time': this.blackbox_time,
                'blackbox_amount_total': this.blackbox_amount_total,
                'blackbox_ticket_counters': this.blackbox_ticket_counters,
                'blackbox_unique_fdm_production_number': this.blackbox_unique_fdm_production_number,
                'blackbox_vsc_identification_number': this.blackbox_vsc_identification_number,
                'blackbox_signature': this.blackbox_signature,
                'blackbox_plu_hash': this.blackbox_plu_hash,
                'blackbox_pos_version': this.blackbox_pos_version,
                'blackbox_pos_production_id': this.blackbox_pos_production_id,
                'blackbox_pro_forma': this.blackbox_pro_forma,
            });

            if (this.blackbox_base_price_in_euro_per_tax_letter) {
                to_return = _.extend(to_return, {
                    'blackbox_tax_category_a': this.blackbox_base_price_in_euro_per_tax_letter[0].amount,
                    'blackbox_tax_category_b': this.blackbox_base_price_in_euro_per_tax_letter[1].amount,
                    'blackbox_tax_category_c': this.blackbox_base_price_in_euro_per_tax_letter[2].amount,
                    'blackbox_tax_category_d': this.blackbox_base_price_in_euro_per_tax_letter[3].amount,
                });
            }

            if (this.blackbox_pos_receipt_time) {
                var DEFAULT_SERVER_DATETIME_FORMAT = "YYYY-MM-DD HH:mm:ss";
                var original_zone = this.blackbox_pos_receipt_time.zone();

                this.blackbox_pos_receipt_time.zone(0); // server expects UTC
                to_return['blackbox_pos_receipt_time'] = this.blackbox_pos_receipt_time.format(DEFAULT_SERVER_DATETIME_FORMAT);
                this.blackbox_pos_receipt_time.zone(original_zone);
            }

            return to_return;
        },

        export_for_printing: function () {
            var receipt = order_model_super.export_for_printing.bind(this)();

            receipt = _.extend(receipt, {
                'company': _.extend(receipt.company, {
                    'street': this.pos.company.street
                })
            });

            return receipt;
        },

        _hash_and_sign_string: function () {
            var order_str = "";

            this.get_orderlines().forEach(function (current, index, array) {
                order_str += current.generate_plu_line();
            });

            return order_str;
        },

        get_tax_percentage_for_tax_letter: function (tax_letter) {
            var percentage_per_letter = {
                'A': 21,
                'B': 12,
                'C': 6,
                'D': 0
            };

            return percentage_per_letter[tax_letter];
        },

        get_base_price_in_eurocent_per_tax_letter: function () {
            var base_price_per_tax_letter = {
                'A': 0,
                'B': 0,
                'C': 0,
                'D': 0
            };

            this.get_orderlines().forEach(function (current, index, array) {
                var tax_letter = current.get_vat_letter();

                if (tax_letter) {
                    base_price_per_tax_letter[tax_letter] += Math.round(current.get_price_without_tax() * 100);
                }
            });

            return base_price_per_tax_letter;
        },

        // returns an array of the form:
        // [{'letter', 'amount'}, {'letter', 'amount'}, ...]
        get_base_price_in_euro_per_tax_letter_list: function () {
            var base_price_per_tax_letter = this.get_base_price_in_eurocent_per_tax_letter();
            var base_price_per_tax_letter_list = _.map(_.keys(base_price_per_tax_letter), function (key) {
                return {
                    'letter': key,
                    'amount': base_price_per_tax_letter[key] / 100
                };
            });

            return base_price_per_tax_letter_list;
        },

        calculate_hash: function () {
            return Sha1.hash(this._hash_and_sign_string());
        },

        set_validation_time: function () {
            this.blackbox_pos_receipt_time = moment();
        }
    });

    var FDMPacketField = Class.extend({
        init: function (name, length, content, pad_character) {
            if (typeof content !== 'string') {
                throw "Can only handle string contents";
            }

            if (content.length > length) {
                throw "Content (" + content + ") too long (should be max " + length + ")";
            }

            this.name = name;
            this.length = length;

            this.content = this._pad_left_to_length(content, pad_character);
        },

        _pad_left_to_length: function (content, pad_character) {
            if (content.length < this.length && ! pad_character) {
                throw "Can't pad without a pad character";
            }

            while (content.length < this.length) {
                content = pad_character + content;
            }

            return content;
        },

        to_string: function () {
            return this.content;
        }
    });

    var FDMPacket = Class.extend({
        init: function () {
            this.fields = [];
        },

        add_field: function (field) {
            this.fields.push(field);
        },

        to_string: function () {
            return _.map(this.fields, function (field) {
                return field.to_string();
            }).join("");
        },

        to_human_readable_string: function () {
            return _.map(this.fields, function (field) {
                return field.name + ": " + field.to_string();
            }).join("\n");
        }
    });

    gui.Gui.include({
        show_screen: function(screen_name, params, refresh) {
            if (screen_name === "receipt" || screen_name === "bill") {
                var order = this.pos.get_order();
                if (order && order.blackbox_signature.toLowerCase().match(/[a-z]/)) {
                    this._super(screen_name, params, refresh);
                } else {
                    console.log("not showing receipt because no signature is set");
                }
            } else {
                this._super(screen_name, params, refresh);
            }
        }
    });

    devices.ProxyDevice.include({
        _get_sequence_number: function () {
            var sequence_number = this.pos.db.load('sequence_number', 0);
            this.pos.db.save('sequence_number', (sequence_number + 1) % 100);

            return sequence_number;
        },

        build_request: function (id) {
            var packet = new FDMPacket();

            packet.add_field(new FDMPacketField("id", 1, id));
            packet.add_field(new FDMPacketField("sequence number", 2, this._get_sequence_number().toString(), "0"));
            packet.add_field(new FDMPacketField("retry number", 1, "0"));

            return packet;
        },

        // ignore_non_critical: will ignore warnings and will ignore
        // certain 'real' errors defined in non_critical_errors
        _handle_fdm_errors: function (parsed_response, ignore_non_critical) {
            var self = this;
            var error_1 = parsed_response.error_1;
            var error_2 = parsed_response.error_2;

            var non_critical_errors = [
                1, // no vat signing card
                2, // initialize vat signing card with pin
                3, // vsc blocked
                5, // memory full
                9, // real time clock corrupt
                10, // vsc not compatible
            ];

            if (error_1 === 0) { // no errors
                if (error_2 === 1) {
                    this.pos.gui.show_popup("confirm", {
                        'title': _t("Fiscal Data Module"),
                        'body':  _t("PIN accepted."),
                    });
                }

                return true;
            } else if (error_1 === 1 && ! ignore_non_critical) { // warnings
                if (error_2 === 1) {
                    this.pos.gui.show_popup("error", {
                        'title': _t("Fiscal Data Module warning"),
                        'body':  _t("Fiscal Data Module memory 90% full."),
                    });
                } else if (error_2 === 2) {
                    this.pos.gui.show_popup("error", {
                        'title': _t("Fiscal Data Module warning"),
                        'body':  _t("Already handled request."),
                    });
                } else if (error_2 === 3) {
                    this.pos.gui.show_popup("error", {
                        'title': _t("Fiscal Data Module warning"),
                        'body':  _t("No record."),
                    });
                } else if (error_2 === 99) {
                    this.pos.gui.show_popup("error", {
                        'title': _t("Fiscal Data Module warning"),
                        'body':  _t("Unspecified warning."),
                    });
                }

                return true;
            } else { // errors
                if (ignore_non_critical && non_critical_errors.indexOf(error_2) !== -1) {
                    return true;
                }

                if (error_2 === 1) {
                    this.pos.gui.show_popup("error", {
                        'title': _t("Fiscal Data Module error"),
                        'body':  _t("No Vat Signing Card or Vat Signing Card broken."),
                    });
                } else if (error_2 === 2) {
                    this.pos.gui.show_popup("number", {
                        'title': _t("Please initialize the Vat Signing Card with PIN."),
                        'confirm': function (pin) {
                            self.pos.proxy.request_fdm_pin_verification(pin);
                        }
                    });
                } else if (error_2 === 3) {
                    this.pos.gui.show_popup("error", {
                        'title': _t("Fiscal Data Module error"),
                        'body':  _t("Vat Signing Card blocked."),
                    });
                } else if (error_2 === 4) {
                    this.pos.gui.show_popup("error", {
                        'title': _t("Fiscal Data Module error"),
                        'body':  _t("Invalid PIN."),
                    });
                } else if (error_2 === 5) {
                    this.pos.gui.show_popup("error", {
                        'title': _t("Fiscal Data Module error"),
                        'body':  _t("Fiscal Data Module memory full."),
                    });
                } else if (error_2 === 6) {
                    this.pos.gui.show_popup("error", {
                        'title': _t("Fiscal Data Module error"),
                        'body':  _t("Unknown identifier."),
                    });
                } else if (error_2 === 7) {
                    this.pos.gui.show_popup("error", {
                        'title': _t("Fiscal Data Module error"),
                        'body':  _t("Invalid data in message."),
                    });
                } else if (error_2 === 8) {
                    this.pos.gui.show_popup("error", {
                        'title': _t("Fiscal Data Module error"),
                        'body':  _t("Fiscal Data Module not operational."),
                    });
                } else if (error_2 === 9) {
                    this.pos.gui.show_popup("error", {
                        'title': _t("Fiscal Data Module error"),
                        'body':  _t("Fiscal Data Module real time clock corrupt."),
                    });
                } else if (error_2 === 10) {
                    this.pos.gui.show_popup("error", {
                        'title': _t("Fiscal Data Module error"),
                        'body':  _t("Vat Signing Card not compatible with Fiscal Data Module."),
                    });
                } else if (error_2 === 99) {
                    this.pos.gui.show_popup("error", {
                        'title': _t("Fiscal Data Module error"),
                        'body':  _t("Unspecified error."),
                    });
                }

                return false;
            }
        },

        _parse_fdm_common_response: function (response) {
            return {
                identifier: response[0],
                sequence_number: parseInt(response.substr(1, 2), 10),
                retry_counter: parseInt(response[3], 10),
                error_1: parseInt(response[4], 10),
                error_2: parseInt(response.substr(5, 2), 10),
                error_3: parseInt(response.substr(7, 3), 10),
                fdm_unique_production_number: response.substr(10, 11),
            };
        },

        parse_fdm_identification_response: function (response) {
            return _.extend(this._parse_fdm_common_response(response),
                            {
                                fdm_firmware_version_number: response.substr(21, 20),
                                fdm_communication_protocol_version: response[41],
                                vsc_identification_number: response.substr(42, 14),
                                vsc_version_number: parseInt(response.substr(56, 3), 10)
                            });
        },

        parse_fdm_pin_response: function (response) {
            return _.extend(this._parse_fdm_common_response(response),
                            {
                                vsc_identification_number: response.substr(21, 14),
                            });
        },

        parse_fdm_hash_and_sign_response: function (response) {
            return _.extend(this._parse_fdm_common_response(response),
                            {
                                vsc_identification_number: response.substr(21, 14),
                                date: response.substr(35, 8),
                                time: response.substr(43, 6),
                                event_label: response.substr(49, 2),
                                vsc_ticket_counter: parseInt(response.substr(51, 9)),
                                vsc_total_ticket_counter: parseInt(response.substr(60, 9)),
                                signature: response.substr(69, 40)
                            });
        },

        _build_fdm_identification_request: function () {
            return this.build_request("I");
        },

        _build_fdm_pin_request: function (pin) {
            var packet = this.build_request("P");
            packet.add_field(new FDMPacketField("pin code", 5, pin.toString(), "0"));

            return packet;
        },

        // fdm needs amounts in cents with at least 3 numbers (eg. 0.5
        // euro => '050') and encoded as a string
        _amount_to_fdm_amount_string: function (amount) {
            amount *= 100; // to eurocent
            amount = round_pr(amount, 0.01); // make sure it's properly rounded (to avoid eg. x.9999999999999999999)
            amount = amount.toString();

            while (amount.length < 3) {
                amount = "0" + amount;
            }

            return amount;
        },

        // todo jov: p77
        _build_fdm_hash_and_sign_request: function (order) {
            var packet = this.build_request("H");
            var insz_or_bis_number = this.pos.get_cashier().insz_or_bis_number;

            if (! insz_or_bis_number) {
                throw new Error("FDM error: INSZ or BIS number not set for current cashier.");
            }

            packet.add_field(new FDMPacketField("ticket date", 8, order.blackbox_pos_receipt_time.format("YYYYMMDD")));
            packet.add_field(new FDMPacketField("ticket time", 6, order.blackbox_pos_receipt_time.format("HHmmss")));
            packet.add_field(new FDMPacketField("insz or bis number", 11, insz_or_bis_number));
            packet.add_field(new FDMPacketField("production number POS", 14, this.pos.blackbox_pos_production_id));
            packet.add_field(new FDMPacketField("ticket number", 6, (++this.pos.config.backend_sequence_number).toString(), "0"));

            if (order.blackbox_pro_forma) {
                packet.add_field(new FDMPacketField("event label", 2, "PS"));
            } else {
                packet.add_field(new FDMPacketField("event label", 2, "NS"));
            }

            packet.add_field(new FDMPacketField("total amount to pay in eurocent", 11, this._amount_to_fdm_amount_string(order.blackbox_amount_total), " "));

            packet.add_field(new FDMPacketField("tax percentage 1", 4, "2100"));
            packet.add_field(new FDMPacketField("amount at tax percentage 1 in eurocent", 11, this._amount_to_fdm_amount_string(order.blackbox_base_price_in_euro_per_tax_letter[0].amount), " "));
            packet.add_field(new FDMPacketField("tax percentage 2", 4, "1200"));
            packet.add_field(new FDMPacketField("amount at tax percentage 2 in eurocent", 11, this._amount_to_fdm_amount_string(order.blackbox_base_price_in_euro_per_tax_letter[1].amount), " "));
            packet.add_field(new FDMPacketField("tax percentage 3", 4, " 600"));
            packet.add_field(new FDMPacketField("amount at tax percentage 3 in eurocent", 11, this._amount_to_fdm_amount_string(order.blackbox_base_price_in_euro_per_tax_letter[2].amount), " "));
            packet.add_field(new FDMPacketField("tax percentage 4", 4, " 000"));
            packet.add_field(new FDMPacketField("amount at tax percentage 4 in eurocent", 11, this._amount_to_fdm_amount_string(order.blackbox_base_price_in_euro_per_tax_letter[3].amount), " "));
            packet.add_field(new FDMPacketField("PLU hash", 40, order.calculate_hash()));

            return packet;
        },

        _show_could_not_connect_error: function () {
            this.pos.gui.show_popup("error", {
                'title': _t("Fiscal Data Module error"),
                'body':  _t("Could not connect to the Fiscal Data Module."),
            });
        },

        request_fdm_identification: function () {
            var self = this;

            return this.message('request_blackbox', {
                'high_level_message': self._build_fdm_identification_request().to_string(),
                'response_size': 59
            }).then(function (response) {
                if (! response) {
                    self._show_could_not_connect_error();
                    return "";
                } else {
                    var parsed_response = self.parse_fdm_identification_response(response);

                    if (self._handle_fdm_errors(parsed_response, true)) {
                        return parsed_response;
                    } else {
                        return "";
                    }
                }
            });
        },

        request_fdm_pin_verification: function (pin) {
            var self = this;

            return this.message('request_blackbox', {
                'high_level_message': self._build_fdm_pin_request(pin).to_string(),
                'response_size': 35
            }).then(function (response) {
                if (! response) {
                    self._show_could_not_connect_error();
                } else {
                    var parsed_response = self.parse_fdm_pin_response(response);

                    // pin being verified will show up as 'error'
                    self._handle_fdm_errors(parsed_response);
                }
            });
        },

        request_fdm_hash_and_sign: function (packet, hide_error) {
            var self = this;

            console.log(packet.to_human_readable_string());

            return this.message('request_blackbox', {
                'high_level_message': packet.to_string(),
                'response_size': 109
            }).then(function (response) {
                if (! response) {
                    if (! hide_error) {
                        self._show_could_not_connect_error();
                    }

                    return self.request_fdm_hash_and_sign(packet, "hide error");
                } else {
                    var parsed_response = self.parse_fdm_hash_and_sign_response(response);
                    console.log(parsed_response);

                    if (self._handle_fdm_errors(parsed_response)) {
                        return parsed_response;
                    } else {
                        return "";
                    }
                }
            }, function () {
                self._show_could_not_connect_error();
                return "";
            });
        }
    });

    var BlackBoxIdentificationWidget = PosBaseWidget.extend({
        template: 'BlackboxIdentificationWidget',
        start: function () {
            var self = this;

            this.$el.click(function () {
                self.pos.proxy.request_fdm_identification().then(function (parsed_response) {
                    if (parsed_response) {
                        var list = _.map(_.pairs(_.pick(parsed_response, 'fdm_unique_production_number',
                                                        'fdm_firmware_version_number',
                                                        'fdm_communication_protocol_version',
                                                        'vsc_identification_number',
                                                        'vsc_version_number')), function (current) {
                                                            return {
                                                                'label': current[0].replace(/_/g, " ") + ": " + current[1]
                                                            };
                                                        });

                        self.gui.show_popup("selection", {
                            'title': _t("FDM identification"),
                            'list': list
                        });
                    }
                });
            });

            if (! this.pos.config.use_proxy) {
                this.$().addClass('oe_hidden');
            }
        },
    });

    chrome.Chrome.include({
        build_widgets: function () {
            // add blackbox id widget to left of proxy widget
            var proxy_status_index = _.findIndex(this.widgets, function (widget) {
                return widget.name === "proxy_status";
            });

            this.widgets.splice(proxy_status_index, 0, {
                'name': 'blackbox_identification',
                'widget': BlackBoxIdentificationWidget,
                'append': '.pos-rightheader',
            });

            var debug_widget = _.find(this.widgets, function (widget) {
                return widget.name === "debug";
            });

            debug_widget.widget.include({
                start: function () {
                    var self = this;
                    this._super();

                    this.$('.button.build-hash-and-sign-request').click(function () {
                        var order = self.pos.get_order();
                        order.set_validation_time();
                        order.blackbox_base_price_in_euro_per_tax_letter = order.get_base_price_in_euro_per_tax_letter_list();

                        console.log(self.pos.proxy._build_fdm_hash_and_sign_request(order).to_human_readable_string());
                    });
                }
            });

            this._super();
        },

        // show_error with the option of showing user-friendly errors
        // (without backtrace etc.)
        show_error: function(error) {
            if (error.message.indexOf("FDM error: ") > -1) {
                this.gui.show_popup('error',{
                    'title': "POS Error",
                    'body':  error.message,
                });
            } else {
                this._super(error);
            }
        }
    });
    var posmodel_super = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        _extract_order_number: function (records) {
            if (records.length) {
                return parseInt(records[0]['name'].match(/\d+$/)[0], 10);
            } else {
                return 0;
            }
        },

        _prepare_date_for_ticket: function (date) {
            // format of date coming from blackbox is YYYYMMDD
            var year = date.substr(0, 4);
            var month = date.substr(4, 2);
            var day = date.substr(6, 2);

            return day + "/" + month + "/" + year;
        },

        _prepare_time_for_ticket: function (time) {
            // format of time coming from blackbox is HHMMSS
            var hours = time.substr(0, 2);
            var minutes = time.substr(2, 2);
            var seconds = time.substr(4, 2);

            return hours + ":" + minutes + ":" + seconds;
        },

        _prepare_ticket_counter_for_ticket: function (counter, total_counter, event_type) {
            return counter + "/" + total_counter + " " + event_type;
        },

        _prepare_plu_hash_for_ticket: function (hash) {
            var amount_of_least_significant_characters = 8;

            return hash.substr(-amount_of_least_significant_characters);
        },

        _check_validation_constraints: function () {
            if (! this.company.street) {
                this.gui.show_popup("error", {
                    'title': _t("Fiscal Data Module error"),
                    'body':  _t("Company address must be set."),
                });

                return false;
            } else if (! this.company.vat) {
                this.gui.show_popup("error", {
                    'title': _t("Fiscal Data Module error"),
                    'body':  _t("VAT number must be set."),
                });

                return false;
            } else if (this.pos_session.forbidden_modules_installed) {
                this.gui.show_popup("error", {
                    'title': _t("Fiscal Data Module error"),
                    'body':  _t("The reprint and discount module are not allowed to be installed with the Fiscal Data Module."),
                });

                return false;
            }

            return true;
        },

        push_order_to_blackbox: function (order) {
            var self = this;

            if (! this._check_validation_constraints()) {
                return new $.Deferred().reject();
            }

            order.set_validation_time();
            order.blackbox_amount_total = order.get_total_with_tax();
            order.blackbox_base_price_in_euro_per_tax_letter = order.get_base_price_in_euro_per_tax_letter_list();

            console.log("Signing order with uid " + order.uid);
            var packet = this.proxy._build_fdm_hash_and_sign_request(order);
            var def = this.proxy.request_fdm_hash_and_sign(packet).then(function (parsed_response) {
                var def = new $.Deferred();

                if (parsed_response) {
                    // put fields that we need on tickets on order
                    order.blackbox_order_name = self.config.name + "/" + self.config.backend_sequence_number;
                    order.blackbox_date = self._prepare_date_for_ticket(parsed_response.date);
                    order.blackbox_time = self._prepare_time_for_ticket(parsed_response.time);
                    order.blackbox_ticket_counters =
                        self._prepare_ticket_counter_for_ticket(parsed_response.vsc_ticket_counter,
                                                                parsed_response.vsc_total_ticket_counter,
                                                                parsed_response.event_label);
                    order.blackbox_signature = parsed_response.signature;
                    order.blackbox_vsc_identification_number = parsed_response.vsc_identification_number;
                    order.blackbox_unique_fdm_production_number = parsed_response.fdm_unique_production_number;
                    order.blackbox_plu_hash = self._prepare_plu_hash_for_ticket(packet.fields[packet.fields.length - 1].content);
                    order.blackbox_pos_version = "Odoo " + self.version.server_version + "BE_FDM";
                    order.blackbox_pos_production_id = self.blackbox_pos_production_id;

                    if (! order.blackbox_pro_forma) {
                        self.gui.show_screen('receipt');
                    }

                    return def.resolve();
                } else {
                    return def.reject();
                }
            });

            return def;
        },

        // after_blackbox: function that will be executed when we have
        // received the response from the blackbox.
        push_order: function (order, opts, pro_forma, after_blackbox) {
            var self = this;

            if (order) {
                order.blackbox_pro_forma = pro_forma || false;

                return this.push_order_to_blackbox(order).then(function () {
                    console.log("blackbox success, calling push_order _super().");

                    if (after_blackbox) {
                        after_blackbox();
                    }

                    return posmodel_super.push_order.apply(self, [order, opts]);
                }, function () {
                    console.log("fdm validation failed, not sending to backend");
                    return new $.Deferred().reject();
                });
            } else {
                return posmodel_super.push_order.apply(self, arguments);
            }
        },

        push_and_invoice_order: function (order) {
            var self = this;
            var invoiced = new $.Deferred();

            // these will never be sent as pro_forma
            order.blackbox_pro_forma = false;

            // this is a duplicate test from _super(), it is necessary
            // because we do not want to send orders to the blackbox
            // which will not be sent to the backend
            if(! order.get_client()) {
                invoiced.reject({code:400, message:'Missing Customer', data:{}});
                return invoiced;
            }

            return this.push_order_to_blackbox(order).then(function () {
                console.log("blackbox success, calling push_and_invoice_order _super().");
                return posmodel_super.push_and_invoice_order.apply(self, [order]);
            }, function () {
                console.log("fdm validation failed, not sending to backend");
            });
        },


        _push_pro_forma: function () {
            var old_order = this.get_order();

            // Only push orders with something in them as pro forma.
            // Also don't push orders which have pro_forma set to
            // false. Because those are 'real orders' that we already
            // handled.
            if (old_order && old_order.get_orderlines().length && old_order.blackbox_pro_forma !== false) {
                return this.push_order(old_order, undefined, true, function () {
                    // mark the lines that have been pro forma'd, because we won't allow to change them
                    old_order.get_orderlines().forEach(function (current, index, array) {
                        current.blackbox_pro_forma_finalized = true;
                        current.trigger('change', current); // force export
                    });
                });
            } else {
                return new $.Deferred().reject();
            }
        },

        add_new_order: function () {
            this._push_pro_forma();

            return posmodel_super.add_new_order.apply(this, arguments);
        },

        set_order: function (order) {
            this._push_pro_forma();

            return posmodel_super.set_order.apply(this, arguments);
        },

        after_load_server_data: function () {
            // with this module we will always have to connect to the
            // proxy, regardless of user preferences
            this.config.use_proxy = true;

            return posmodel_super.after_load_server_data.apply(this, arguments);
        },

        delete_current_order: function () {
            this.gui.show_popup("error", {
                'title': _t("Fiscal Data Module error"),
                'body':  _t("Deleting of orders is not allowed. Finish this order by eg. creating an empty ticket."),
            });
        }
    });

    screens.ProductScreenWidget.include({
        start: function () {
            this._super();

            var print_bill_button = this.action_buttons['print_bill'];

            if (print_bill_button) {
                var print_bill_super = print_bill_button.button_click;
                print_bill_button.button_click = function () {
                    var self = this;
                    this.pos._push_pro_forma().then(function () {
                        print_bill_super.bind(self)();
                    });
                };
            }

            var fiscal_position_button = this.action_buttons['set_fiscal_position'];

            if (fiscal_position_button) {
                fiscal_position_button.hide();
            }
        }
    });

    screens.NumpadWidget.include({
        clickChangeMode: function (event) {
            if (event.currentTarget.attributes['data-mode'].nodeValue === "price") {
                this.gui.show_popup("error", {
                    'title': _t("Fiscal Data Module error"),
                    'body':  _t("Adjusting the price is not allowed."),
                });
            } else {
                this._super(event);
            }
        }
    });

    screens.ProductListWidget.include({
        set_product_list: function (product_list) {
            var self = this;

            // get rid of the work_in and work_out products because
            // we're not allowed to have pro forma work_in/out orders.
            product_list = _.reject(product_list, function (current) {
                return current === self.pos.work_in_product || current === self.pos.work_out_product;
            });

            return this._super(product_list);
        }
    });

    var work_out_button = screens.ActionButtonWidget.extend({
        template: 'WorkOutButton',
        button_click: function () {
            var self = this;

            self.pos.proxy.request_fdm_identification().then(function (parsed_response) {
                if (parsed_response) {
                    self.pos.add_new_order();
                    self.pos.get_order().add_product(self.pos.work_out_product);
                    self.pos.push_order(self.pos.get_order());
                    self.gui.show_screen('receipt');
                }
            });
        }
    });

    screens.define_action_button({
        'name': 'work_out',
        'widget': work_out_button,
    });

    var work_in_button = screens.ActionButtonWidget.extend({
        template: 'WorkInButton',
        button_click: function () {
            var self = this;

            self.pos.proxy.request_fdm_identification().then(function (parsed_response) {
                if (parsed_response) {
                    self.pos.add_new_order();
                    self.pos.get_order().add_product(self.pos.work_in_product);
                    self.pos.push_order(self.pos.get_order());
                    self.gui.show_screen('receipt');
                }
            });
        }
    });

    screens.define_action_button({
        'name': 'work_in',
        'widget': work_in_button,
    });

    models.load_models({
        'model': "ir.config_parameter",
        'fields': ['key', 'value'],
        'domain': [['key', '=', 'database.uuid']],
        'loaded': function (self, params) {
            // 12 lsB of db uid + 2 bytes pos config
            var config_id = self.config.id.toString();

            if (config_id.length < 2) {
                config_id = "0" + config_id;
            }

            self.blackbox_pos_production_id = "BODO001" + params[0].value.substr(-5) + config_id;

            self.chrome.ready.then(function () {
                $(self.chrome.$el).find('.placeholder-posID').text(self.blackbox_pos_production_id);
            });
        }
    }, {
        'after': "pos.config"
    });

    models.load_models({
        'model': "pos.order",
        'domain': function (self) { return [['config_id', '=', self.config.id]]; },
        'order': "-date_order",
        'loaded': function (self, params) {
            self.config.backend_sequence_number = self._extract_order_number(params);
        }
    }, {
        'after': "pos.config"
    });

    // pro forma and regular orders share numbers, so we also need to check the pro forma orders and pick the max
    models.load_models({
        'model': "pos.order_pro_forma",
        'domain': function (self) { return [['config_id', '=', self.config.id]]; },
        'order': "-date_order",
        'loaded': function (self, params) {
            var pro_forma_number = self._extract_order_number(params);
            self.config.backend_sequence_number = Math.max(self.config.backend_sequence_number, pro_forma_number);
        }
    }, {
        'after': "pos.order"
    });

    models.load_models({
        'model': "ir.model.data",
        'domain': ['|', ['name', '=', 'product_product_work_in'], ['name', '=', 'product_product_work_out']],
        'fields': ['name', 'res_id'],
        'loaded': function (self, params) {
            params.forEach(function (current, index, array) {
                if (current.name === "product_product_work_in") {
                    self.work_in_product = self.db.product_by_id[current['res_id']];
                } else if (current.name === "product_product_work_out") {
                    self.work_out_product = self.db.product_by_id[current['res_id']];
                }
            });
        }
    }, {
        'after': "product.product"
    });

    models.load_fields("res.users", "insz_or_bis_number");
    models.load_fields("account.tax", "identification_letter");
    models.load_fields("res.company", "street");
    models.load_fields("pos.session", "forbidden_modules_installed");

    return {
        'FDMPacketField': FDMPacketField,
        'FDMPacket': FDMPacket
    };
});
