odoo.define('website.search', function (require) {
'use strict';

class Filter {

    constructor () {
        this.items = [];
        this.limit = 0;
    }
    
    /**
     * Add the item
     * @param {Object} item
     */
    add (item) {
        this.items.push(item); 
    }

    /**
     * 
     * @param {*} gate 
     */
    apply (gate) {
        
        let i = 0;
        let j = this.items.length - 1;

        // [0; this.limit[ -> Element displayed
        // [this.limit; this.item.length [ -> Element hidden

        while (i <= j) {
            var item = this.items[i];
            if (this.eval(gate, item)) {
                item.show();
                i++;
            } else {
                this.items[i] = this.items[j];
                this.items[j] = item;
                item.hide();
                j--;
            }
        }

        this.limit = i;
    }

    eval (gate, args) {
        if (Array.isArray(gate)) {
            if (gate[0] === '&') {
                for (let k = 1; k < gate.length; k++) {
                    if (!this.eval(gate[k], args)) {
                        return false;
                    }
                }
                return true;
            }
            if (gate[0] === '|') {
                for (let k = 1; k < gate.length; k++) {
                    if (this.eval(gate[k], args)) {
                        return true;
                    }
                }
                return false;
            }
            if (gate[0] === '!') {
                return !this.eval(gate[1], args);
            }
        }
        return gate(args);
    }

    /**
     * 
     * @param {Function} callback 
     */
    forEachVisibleItem (callback) {
        for (let i = 0; i < this.limit; i++) {
            callback(this.items[i]);
        }
    }

    /**
     * @param {Function} callback
     */
    forEachItem (callback) {
        for (let i = 0; i < this.items.length; i++) {
            callback(this.items[i]);
        }
    }

    count () {
        return this.limit;
    }
}

return Filter;
});
