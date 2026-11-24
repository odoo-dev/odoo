declare module "services" {
    import { busService } from "@bus/services/bus_plugin";

    export interface Services {
        bus_service: typeof busService,
    }
}
