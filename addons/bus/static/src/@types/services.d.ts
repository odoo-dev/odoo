declare module "services" {
    import { busService } from "@bus/services/bus_plugin";
    import { BusLogsPlugin } from "@bus/debug/bus_logs_plugin";

    export interface Services {
        bus_service: typeof busService,
        "bus.logs_service": BusLogsPlugin,
    }
}
