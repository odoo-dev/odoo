/** @odoo-module */

import { Chrome } from "@point_of_sale/../tests/tours/helpers/ChromeTourMethods";
import { ProductScreen } from "@point_of_sale/../tests/tours/helpers/ProductScreenTourMethods";
import { PaymentScreen } from "@point_of_sale/../tests/tours/helpers/PaymentScreenTourMethods";
import { OnlinePaymentPopup } from "@pos_online_payment/../tests/tours/helpers/OnlinePaymentPopupTourMethods";
import { ReceiptScreen } from "@point_of_sale/../tests/tours/helpers/ReceiptScreenTourMethods";
import { ErrorPopup } from "@point_of_sale/../tests/tours/helpers/ErrorPopupTourMethods";
import { getSteps, startSteps } from "@point_of_sale/../tests/tours/helpers/utils";
import { registry } from "@web/core/registry";

registry
    .category("web_tour.tours")
    .add("OnlinePaymentLocalFakePaidDataTour", { 
        test: true, 
        url: "/pos/ui", 
        steps: () => {
            startSteps();
            
            ProductScreen.do.confirmOpeningPopup();
            ProductScreen.exec.addOrderline("Butter Croissant", "10");
            ProductScreen.check.selectedOrderlineHas("Butter Croissant", "10.0");
            ProductScreen.do.clickPayButton();
            PaymentScreen.check.totalIs("12.0");
            PaymentScreen.check.emptyPaymentlines("12.0");
            
            PaymentScreen.do.clickPaymentMethod("Online payment");
            PaymentScreen.do.enterPaymentLineAmount("Online payment", "12");
            PaymentScreen.check.selectedPaymentlineHas("Online payment", "12.0");
            PaymentScreen.check.remainingIs("0.0");
            PaymentScreen.check.changeIs("0.0");
            PaymentScreen.check.validateButtonIsHighlighted(true);
            PaymentScreen.do.clickValidate();
            OnlinePaymentPopup.check.isShown();
            OnlinePaymentPopup.check.amountIs("12.0");
            OnlinePaymentPopup.do.fakeOnlinePaymentPaidData();
            OnlinePaymentPopup.check.isNotShown();
            ReceiptScreen.check.isShown();
            ReceiptScreen.check.receiptIsThere();
            return getSteps() 
        }
    });

registry
    .category("web_tour.tours")
    .add("OnlinePaymentErrorsTour", { 
        test: true, 
        url: "/pos/ui", 
        steps: () => {
            startSteps();
            
            ProductScreen.do.confirmOpeningPopup();
            ProductScreen.exec.addOrderline("Butter Croissant", "10", "1.5", "15");
            ProductScreen.check.selectedOrderlineHas("Butter Croissant", "10.0");
            ProductScreen.do.clickPayButton();
            PaymentScreen.check.totalIs("15.0");
            PaymentScreen.check.emptyPaymentlines("15.0");
            
            PaymentScreen.do.clickPaymentMethod("Online payment");
            PaymentScreen.do.enterPaymentLineAmount("Online payment", "14");
            PaymentScreen.check.selectedPaymentlineHas("Online payment", "14.0");
            PaymentScreen.check.remainingIs("1.0");
            PaymentScreen.check.changeIs("0.0");
            PaymentScreen.check.validateButtonIsHighlighted(false);
            PaymentScreen.do.clickPaymentMethod("Cash");
            PaymentScreen.do.enterPaymentLineAmount("Cash", "2");
            PaymentScreen.check.selectedPaymentlineHas("Cash", "2.0");
            PaymentScreen.check.remainingIs("0.0");
            PaymentScreen.check.changeIs("1.0");
            PaymentScreen.check.validateButtonIsHighlighted(true);
            PaymentScreen.do.clickValidate();
            ErrorPopup.check.isShown();
            ErrorPopup.do.clickConfirm();
            PaymentScreen.do.clickPaymentline("Online payment", "14.0");
            PaymentScreen.do.clickPaymentlineDelButton("Online payment", "14.0");
            PaymentScreen.do.clickPaymentMethod("Online payment");
            PaymentScreen.check.selectedPaymentlineHas("Online payment", "13.0");
            PaymentScreen.do.clickPaymentMethod("Online payment");
            PaymentScreen.check.selectedPaymentlineHas("Online payment", "0.0");
            PaymentScreen.check.remainingIs("0.0");
            PaymentScreen.check.changeIs("0.0");
            PaymentScreen.check.validateButtonIsHighlighted(true);
            PaymentScreen.do.clickValidate();
            ErrorPopup.check.isShown();
            ErrorPopup.do.clickConfirm();
            PaymentScreen.do.clickPaymentline("Online payment", "0.0");
            PaymentScreen.do.clickPaymentlineDelButton("Online payment", "0.0");
            PaymentScreen.do.clickPaymentline("Cash", "2.0");
            PaymentScreen.do.enterPaymentLineAmount("Cash", "3");
            PaymentScreen.check.selectedPaymentlineHas("Cash", "3.0");
            PaymentScreen.do.clickPaymentMethod("Online payment");
            PaymentScreen.check.selectedPaymentlineHas("Online payment", "-1.0");
            PaymentScreen.check.remainingIs("0.0");
            PaymentScreen.check.changeIs("0.0");
            PaymentScreen.check.validateButtonIsHighlighted(true);
            PaymentScreen.do.clickValidate();
            ErrorPopup.check.isShown();
            ErrorPopup.do.clickConfirm();

            return getSteps();
        } 
    });

registry
    .category("web_tour.tours")
    .add("OnlinePaymentServerFakePaymentTour", { 
        test: true, 
        url: "/pos/ui", 
        steps: () => {
            
            startSteps();
            
            ProductScreen.do.confirmOpeningPopup();
            ProductScreen.exec.addOrderline("Butter Croissant", "10");
            ProductScreen.check.selectedOrderlineHas("Butter Croissant", "10.0");
            ProductScreen.do.clickPayButton();
            PaymentScreen.check.totalIs("12.0");
            PaymentScreen.check.emptyPaymentlines("12.0");
            
            PaymentScreen.do.clickPaymentMethod("Online payment");
            PaymentScreen.do.enterPaymentLineAmount("Online payment", "12");
            PaymentScreen.check.selectedPaymentlineHas("Online payment", "12.0");
            PaymentScreen.check.remainingIs("0.0");
            PaymentScreen.check.changeIs("0.0");
            PaymentScreen.check.validateButtonIsHighlighted(true);
            PaymentScreen.do.clickValidate();
            OnlinePaymentPopup.check.isShown();
            OnlinePaymentPopup.check.amountIs("12.0");
            OnlinePaymentPopup.check.waitForOnlinePayment();
            OnlinePaymentPopup.check.isNotShown();
            ReceiptScreen.check.isShown();
            ReceiptScreen.check.receiptIsThere();
            Chrome.do.closeSession();
            return getSteps(); 
        } 
    });
