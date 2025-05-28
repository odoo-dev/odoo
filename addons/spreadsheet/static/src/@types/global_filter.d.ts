import { Range, RangeData } from "@odoo/o-spreadsheet";
import { DomainListRepr } from "@web/core/domain";

declare module "@spreadsheet" {
    export type RangeType = "fixedPeriod" | "relative" | "from_to";
    export type FixedPeriods = "quarter" | "month";
    export type RelativePeriod =
        | "last_month"
        | "last_week"
        | "last_three_months"
        | "last_six_months"
        | "last_year"
        | "last_three_years"
        | "year_to_date";
    export type DateFilterTimePeriod = RelativePeriod | "this_month" | "this_quarter" | "this_year";

    export interface FieldMatching {
        chain: string;
        type: string;
        offset?: number;
    }

    export interface TextGlobalFilter {
        type: "text";
        id: string;
        label: string;
        rangesOfAllowedValues?: Range[];
        defaultValue?: string[];
    }

    export interface CmdTextGlobalFilter extends TextGlobalFilter {
        rangesOfAllowedValues?: RangeData[];
    }

    export interface DateGlobalFilterCommon {
        type: "date";
        id: string;
        label: string;
    }

    export interface FromToDateGlobalFilter extends DateGlobalFilterCommon {
        rangeType: "from_to";
        defaultValue?: number[];
    }

    export interface RelativeDateGlobalFilter extends DateGlobalFilterCommon {
        rangeType: "relative";
        defaultValue?: DateFilterTimePeriod;
    }

    export interface FixedPeriodDateGlobalFilter extends DateGlobalFilterCommon {
        rangeType: "fixedPeriod";
        defaultValue?: "this_month" | "this_quarter" | "this_year";
        disabledPeriods?: FixedPeriods[];
    }

    export type DateGlobalFilterAllowedOptions = "relative" | "month" | "quarter" | "year" | "from_to";

    export type DateRelativeValue = {
        type: "relative";
        value: DateFilterTimePeriod;
    }

    export type DefaultDateMonthValue = {
        type: "month";
        value: "CURRENT" | { month: number; year: number };
    }

    export type DateMonthValue = {
        type: "month";
        value: { month: number; year: number };
    }

    export type DefaultDateQuarterValue = {
        type: "quarter";
        value: "CURRENT" | { quarter: number; year: number };
    }

    export type DateQuarterValue = {
        type: "quarter";
        value: { quarter: number; year: number };
    }

    export type DefaultDateYearValue = {
        type: "year";
        value: "CURRENT" | { year: number };
    }

    export type DateYearValue = {
        type: "year";
        value: { year: number };
    }

    export type DateFromToValue = {
        type: "from_to";
        value: { from: string; to: string };
    }

    export type DefaultDateGlobalFilterValue =
        | DateRelativeValue
        | DefaultDateMonthValue
        | DefaultDateQuarterValue
        | DefaultDateYearValue
        | DateFromToValue;

    export type DateGlobalFilterValue =
        | DateRelativeValue
        | DateMonthValue
        | DateQuarterValue
        | DateYearValue
        | DateFromToValue;

    export type DateGlobalFilter = {
        type: "date";
        id: string;
        label: string;
        allowedOptions: DateGlobalFilterAllowedOptions[];
        defaultValue?: DefaultDateGlobalFilterValue;
    }

    export interface RelationalGlobalFilter {
        type: "relation";
        id: string;
        label: string;
        modelName: string;
        includeChildren: boolean;
        defaultValue?: "current_user" | number[];
        domainOfAllowedValues?: DomainListRepr | string;
    }

    export type GlobalFilter = TextGlobalFilter | DateGlobalFilter | RelationalGlobalFilter;
    export type CmdGlobalFilter = CmdTextGlobalFilter | DateGlobalFilter | RelationalGlobalFilter;
}
