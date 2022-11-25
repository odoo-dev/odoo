/** @odoo-module */

import { Chrome } from "@pos_restaurant/../tests/tours/helpers/ChromeTourMethods";
import { FloorScreen } from "@pos_restaurant/../tests/tours/helpers/FloorScreenTourMethods";
import { TextInputPopup } from "@point_of_sale/../tests/tours/helpers/TextInputPopupTourMethods";
import { NumberPopup } from "@point_of_sale/../tests/tours/helpers/NumberPopupTourMethods";
import { ProductScreen } from "@pos_restaurant/../tests/tours/helpers/ProductScreenTourMethods";
import { getSteps, startSteps } from "@point_of_sale/../tests/tours/helpers/utils";
import { registry } from "@web/core/registry";

// signal to start generating steps
// when finished, steps can be taken from getSteps
startSteps();

// check floors if they contain their corresponding tables
FloorScreen.check.selectedFloorIs("Main Floor");
FloorScreen.check.hasTable("T2");
FloorScreen.check.hasTable("T4");
FloorScreen.check.hasTable("T5");
FloorScreen.do.clickFloor("Second Floor");
FloorScreen.check.hasTable("T3");
FloorScreen.check.hasTable("T1");

// clicking table in active mode does not open product screen
// instead, table is selected
FloorScreen.do.clickEdit();
FloorScreen.check.editModeIsActive(true);
FloorScreen.do.clickTable("T3");
FloorScreen.check.selectedTableIs("T3");
FloorScreen.do.clickTable("T1");
FloorScreen.check.selectedTableIs("T1");

// switching floor in edit mode deactivates edit mode
FloorScreen.do.clickFloor("Main Floor");
FloorScreen.check.editModeIsActive(false);
FloorScreen.do.clickEdit();
FloorScreen.check.editModeIsActive(true);

// test add table
FloorScreen.do.clickAddTable();
FloorScreen.check.selectedTableIs("T1");

// TODO: The following 4 lines shouldn't be needed.
// > But if they're removed, the succeeding step won't work.
// > This maybe because the state.selectedTableId is not properly set at the right timing.
// > Or maybe because of poor state management - improperly synchronized `floor.tables` and
// > contents of `tables_by_id`. Maybe take only table information from one source - e.g.
// > remove `floor.tables` and derive `floor.tables` from `tables_by_id`.
FloorScreen.do.clickTable("T2");
FloorScreen.check.selectedTableIs("T2");
FloorScreen.do.clickTable("T1");
FloorScreen.check.selectedTableIs("T1");

FloorScreen.do.clickRename();
TextInputPopup.check.isShown();
TextInputPopup.do.inputText("T100");
TextInputPopup.do.clickConfirm();
FloorScreen.check.selectedTableIs("T100");

// test duplicate table
FloorScreen.do.clickDuplicate();
// new table is already named T101
FloorScreen.check.selectedTableIs("T101");
FloorScreen.do.clickRename();
TextInputPopup.check.isShown();
TextInputPopup.do.inputText("T1111");
TextInputPopup.do.clickConfirm();
FloorScreen.check.selectedTableIs("T1111");

// switch floor, switch back and check if
// the new tables are still there
FloorScreen.do.clickFloor("Second Floor");
FloorScreen.check.editModeIsActive(false);
FloorScreen.check.hasTable("T3");
FloorScreen.check.hasTable("T1");

FloorScreen.do.clickFloor("Main Floor");
FloorScreen.check.hasTable("T2");
FloorScreen.check.hasTable("T4");
FloorScreen.check.hasTable("T5");
FloorScreen.check.hasTable("T100");
FloorScreen.check.hasTable("T1111");

// test delete table
FloorScreen.do.clickEdit();
FloorScreen.check.editModeIsActive(true);
FloorScreen.do.clickTable("T2");
FloorScreen.check.selectedTableIs("T2");
FloorScreen.do.clickTrash();
Chrome.do.confirmPopup();

// change number of seats
FloorScreen.do.clickTable("T4");
FloorScreen.check.selectedTableIs("T4");
FloorScreen.do.clickSeats();
NumberPopup.do.pressNumpad("Backspace 9");
NumberPopup.check.inputShownIs("9");
NumberPopup.do.clickConfirm();
FloorScreen.check.tableSeatIs("T4", "9");

// change number of seat when the input is already selected
FloorScreen.do.clickTable("T4");
FloorScreen.check.selectedTableIs("T4");
FloorScreen.do.clickSeats();
NumberPopup.do.pressNumpad("1 5");
NumberPopup.check.inputShownIs("15");
NumberPopup.do.clickConfirm();
FloorScreen.check.tableSeatIs("T4", "15");

// change shape
FloorScreen.do.changeShapeTo("round");

// Opening product screen in main floor should go back to main floor
FloorScreen.do.clickEdit();
FloorScreen.check.editModeIsActive(false);
FloorScreen.check.tableIsNotSelected("T4");
FloorScreen.do.clickTable("T4");
ProductScreen.check.isShown();
Chrome.check.backToFloorTextIs("Main Floor", "T4");
Chrome.do.backToFloor();

// Opening product screen in second floor should go back to second floor
FloorScreen.do.clickFloor("Second Floor");
FloorScreen.check.hasTable("T3");
FloorScreen.do.clickTable("T3");
Chrome.check.backToFloorTextIs("Second Floor", "T3");

registry.category("web_tour.tours").add("FloorScreenTour", { test: true, url: "/pos/ui", steps: getSteps() });
