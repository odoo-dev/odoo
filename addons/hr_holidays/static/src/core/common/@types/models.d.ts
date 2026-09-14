declare module "models" {
    export interface HrEmployee {
        is_absent: boolean;
        leave_date_to: import("luxon").DateTime;
        outOfOfficeDateEndText: Readonly<string>;
    }
    export interface ResPartner {
        outOfOfficeDateEndText: Readonly<string>;
    }
    export interface ResUsers {
        outOfOfficeDateEndText: Readonly<string>;
    }
}
