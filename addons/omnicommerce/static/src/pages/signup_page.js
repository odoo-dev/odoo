/** @odoo-module **/

import { registry } from "@web/core/registry";
import { rpc } from "@web/core/network/rpc";
import { Component, useState, onWillStart } from "@odoo/owl";

export class OmniSignupPage extends Component {
    static template = "omnicommerce.OmniSignupPage";
    static props = {};


    setup() {
        this.state = useState({
            step: 1,
            selectedApps: [],
            name: "",
            companyName: "",
            email: "",
            isLoading: false,
            errorMessage: "",
            country: "",
        });
        this.marketplaces = [];
        this.ecommercePlatforms = [];
        this.countries = [];
        onWillStart(async () => {
            try {
                const result = await rpc('/omnicommerce/get_channels', {});
                
                if (result.status === 'success') {
                    this.channels = result.channels;
                    this.marketplaces = this.channels.filter(channel => channel.type === 'online_marketplace');
                    this.ecommercePlatforms = this.channels.filter(channel => channel.type === 'ecommerce_platform');
                    this.countries = result.countries;
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                console.error("Error loading marketplaces:", error);
                this.state.errorMessage = "Failed to load marketplaces. Please try again later.";
            }
        });

    }    

    toggleChannel(channelId) {
        this.state.errorMessage = "";
        const index = this.state.selectedApps.indexOf(channelId);
        if (index > -1) {
            this.state.selectedApps.splice(index, 1);
        } else {
            this.state.selectedApps.push(channelId);
        }
    }

    goToStep2() {
        if (this.state.selectedApps.length === 0) {
            this.state.errorMessage = "Please select at least one App to continue.";
            return;
        }
        this.state.errorMessage = "";
        this.state.step = 2;
    }

    goToStep1() {
        this.state.step = 1;
    }

    async startNow() {

        this.state.isLoading = true;
        this.state.errorMessage = "";

        try {
            const result = await rpc('/create_omni_company_user', {
                name: this.state.name,
                username: this.state.email,
                company_name: this.state.companyName,
                selected_channels: this.state.selectedApps,
                country_id: this.state.country
            });

            if (result.status === 'success') {
                window.location.href = '/web';
            }
            else {
                throw new Error(result.message || "An unknown error occurred. Please try again.");
            }    

        } catch (error) {
            this.state.errorMessage = error.message || "An unknown error occurred. Please try again.";
        } finally {
            this.state.isLoading = false;
        }
    }
}

registry.category("public_components").add("omnicommerce.OmniSignupPage", OmniSignupPage)
