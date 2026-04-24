import { multiTabService } from "@bus/multi_tab_service";
import { workerService } from "@bus/services/worker_service";

declare module "services" {
    import { busParametersService } from "@bus/bus_parameters_service";
    import { outdatedPageWatcherService } from "@bus/outdated_page_watcher_service";
    import { busMonitoringservice } from "@bus/services/bus_monitoring_service";
    import { busService } from "@bus/services/bus_service";
    import { busLogsService } from "@bus/services/debug/bus_logs_service";
    import { presenceService } from "@bus/services/presence_service";

    export interface Services {
        "bus.logs_service": typeof busLogsService,
        "bus.monitoring_service": typeof busMonitoringservice,
        "bus.parameters": typeof busParametersService,
        "multi_tab": typeof multiTabService;
        "worker_service": typeof workerService;
        bus_service: typeof busService,
        presence: typeof presenceService,
    }
}
