
import { isLoadingError } from "@spreadsheet/o_spreadsheet/errors";

export async function waitForOdooSources(model) {
    const promises = model.getters
            .getPivotIds()
            .filter((pivotId) => model.getters.getPivotCoreDefinition(pivotId).type === "ODOO")
            .map((pivotId) => model.getters.getPivot(pivotId))
            .map((pivot) => pivot.load());
    promises.push(
        ...model.getters
            .getListIds()
            .map((listId) => model.getters.getListDataSource(listId))
            .map((list) => list.load())
    );
    await Promise.all(promises);
}

export async function waitForDataLoaded(model) {
    await waitForOdooSources(model);
    const odooDataProvider = model.config.custom.odooDataProvider;
    if (!odooDataProvider) {
        return;
    }
    await new Promise((resolve, reject) => {
        function check() {
            model.dispatch("EVALUATE_CELLS");
            if (isLoaded(model)) {
                odooDataProvider.off("data-source-updated", check);
                resolve();
            }
        }
        odooDataProvider.on("data-source-updated", model, check);
        check();
    });
}

function isLoaded(model) {
    for (const sheetId of model.getters.getSheetIds()) {
        for (const cell of Object.values(model.getters.getEvaluatedCells(sheetId))) {
            if (cell.type === "error" && isLoadingError(cell)) {
                return false;
            }
        }
    }
    return true;
}