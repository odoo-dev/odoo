import * as spreadsheet from "@odoo/o-spreadsheet";

const { isEvaluationError, isMatrix, unquote } = spreadsheet.helpers;
const { NotAvailableError, CircularDependencyError } = spreadsheet;

export class ListPresentationLayer {
    constructor(getters, listId, definition, dataSource) {
        this.getters = getters;
        this.id = listId;
        this.definition = definition;
        this.dataSource = dataSource;
    }

    getListHeaderValue(path) {
        const columnDef = this.definition.columns.find((col) => col.name === path);
        return columnDef?.string || this.dataSource.getListHeaderValue(path);
    }

    getListValuesAndFormats(rowCount) {
        if (rowCount === undefined) {
            throw new Error("The number of rows to fetch must be specified");
        }
        const columns = this.definition.columns.filter((col) => !col.hidden);

        if (columns.length === 0) {
            return { value: this.getters.getListDisplayName(this.id) };
        }

        const computedColumns = columns.filter((col) => !!col.computedBy);

        const symbolsInComputed = new Set(
            computedColumns.flatMap((col) => {
                const formula = this.getters.getListCompiledColumnFormula(this.id, col.name);
                return formula.tokens
                    .filter((token) => token.type === "SYMBOL")
                    .map((t) => t.value);
            })
        );

        const columnToFetch = [];
        for (const col of this.definition.columns) {
            if ((!col.hidden || symbolsInComputed.has(col.name)) && !col.computedBy) {
                columnToFetch.push(col);
            }
        }

        if (columnToFetch.length) {
            columnToFetch.forEach((col) => this.dataSource.addFieldPathToFetch(col.name));
            // triggers the fetch of the list values up to `rowCount` to fill the datasource cache (if not already done)
            this.dataSource.getListCellValue(rowCount, columnToFetch[0]?.name);
        }

        const numberRecordsToLoad = Math.min(this.dataSource.data.length, rowCount);
        const valuesAndFormats = [];
        for (const column of columns) {
            if (column.hidden) {
                continue;
            }
            const currentColumn = [];
            currentColumn.push({ value: this.getListHeaderValue(column.name) });
            for (let position = 0; position < numberRecordsToLoad; position++) {
                const cellValueAndFormat = this.getListCellValueAndFormat(column, position);
                currentColumn.push(cellValueAndFormat);
            }
            valuesAndFormats.push(currentColumn);
        }
        return valuesAndFormats;
    }

    getListCellValueAndFormat(column, position) {
        if (column && column.computedBy) {
            return this.computeCellValue(column, position);
        }
        return this._getListCellValueAndFormat(position, column.name);
    }

    _getListCellValueAndFormat(position, path) {
        // shortcut to pre-fill the fetch list (spares a round of server call)
        this.dataSource.addFieldPathToFetch(path);
        const value = this.dataSource.getListCellValue(position, path);
        if (typeof value === "object" && isEvaluationError(value.value)) {
            return value;
        }
        const field = this.dataSource.getFieldFromFieldPath(path);
        const format = this._getListFormat(position, path, field);
        return { value, format };
    }

    computeCellValue(column, position) {
        const formula = this.getters.getListCompiledColumnFormula(this.id, column.name);
        const getSymbolValue = (symbol) => {
            symbol = unquote(symbol, "'");
            const symbolColumn = this.definition.columns.find((col) => col.name === symbol);
            if (!symbolColumn) {
                return new NotAvailableError();
            } else if (symbolColumn.name === column.name) {
                return new CircularDependencyError();
            }
            return this.getListCellValueAndFormat(symbolColumn, position);
        };
        let result = this.getters.evaluateCompiledFormula(
            column.computedBy.sheetId,
            formula,
            getSymbolValue
        );
        if (isMatrix(result)) {
            result = result[0][0];
        }
        return result;
    }

    _getListFormat(position, path, field) {
        const locale = this.getters.getLocale();
        switch (field?.type) {
            case "integer":
                return "0";
            case "float":
                return "#,##0.00";
            case "monetary": {
                const currency = this.getListCurrency(position, path, field.currency_field);
                if (!currency) {
                    return "#,##0.00";
                }
                return this.getters.computeFormatFromCurrency(currency);
            }
            case "date":
                return locale.dateFormat;
            case "datetime":
                return locale.dateFormat + " " + locale.timeFormat;
            case "char":
            case "text":
                return "@";
            default:
                return undefined;
        }
    }

    getListCurrency(position, path, currentFieldName) {
        return this.dataSource.getListCurrency(position, path, currentFieldName);
    }

    refresh() {
        this.dataSource.load({ reload: true });
    }

    addDomain(domain) {
        this.dataSource.addDomain(domain);
    }

    updateDefinition(nextDefinition) {
        this.definition = nextDefinition;
        this.dataSource.onDefinitionChange(nextDefinition);
    }
}
