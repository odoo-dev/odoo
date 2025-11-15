/** @odoo-module **/

import { registry } from "@web/core/registry";
import { patch } from "@web/core/utils/patch";
import { useEffect } from "@odoo/owl";

/**
 * Patch the date/datetime field component to fix UI refresh issue with contract date fields.
 *
 * Fixes UI refresh issue when related date fields are cleared via onchange.
 * The backend updates correctly but the input element doesn't clear visually.
 * This patch syncs the component state with the record data to update the UI.
 */

const fieldsRegistry = registry.category("fields");

const originalGet = fieldsRegistry.get.bind(fieldsRegistry);

fieldsRegistry.get = function(key) {
    const fieldDefinition = originalGet(key);
    
    if ((key === "date" || key === "datetime") && 
        fieldDefinition?.component && 
        !fieldDefinition.component.__dateFieldPatched) {
        
        const DateTimeFieldComponent = fieldDefinition.component;
        
        patch(DateTimeFieldComponent.prototype, {
            setup() {
                super.setup();
                
                useEffect(
                    () => {
                        if (!this.getRecordValue || !this.state) {
                            return;
                        }
                        
                        const recordValue = this.getRecordValue();
                        
                        if (!Array.isArray(recordValue)) {
                            if (!recordValue && this.state.value) {
                                this.state.value = false;
                                
                                if (this.startDate?.el) {
                                    this.startDate.el.value = '';
                                }
                            }
                        } 
                        else {
                            if (!recordValue[0] && this.state.value?.[0]) {
                                this.state.value[0] = false;
                                if (this.startDate?.el) {
                                    this.startDate.el.value = '';
                                }
                            }
                            if (!recordValue[1] && this.state.value?.[1]) {
                                this.state.value[1] = false;
                                if (this.endDate?.el) {
                                    this.endDate.el.value = '';
                                }
                            }
                        }
                    },
                    () => {
                        const deps = [this.props.record.data[this.props.name]];
                        
                        if (this.startDateField) {
                            deps.push(this.props.record.data[this.startDateField]);
                        }
                        if (this.endDateField) {
                            deps.push(this.props.record.data[this.endDateField]);
                        }
                        
                        return deps;
                    }
                );
            },
        });
        
        DateTimeFieldComponent.__dateFieldPatched = true;
        
        console.log(`✓ Date field patch applied for: ${key}`);
    }
    
    return fieldDefinition;
};
