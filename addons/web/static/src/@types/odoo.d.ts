interface OdooModuleFactory {
    deps: string[];
    fn: OdooModuleFactoryFn;
    ignoreMissingDeps: boolean;
}

type OdooModule = Record<string, any>;

type OdooModuleDefineFn = <T = string>(
    name: string,
    deps: T[],
    factory: OdooModuleFactoryFn<T>,
    lazy?: boolean
) => OdooModule;

type OdooModuleFactoryFn<T = string> = (require: (dependency: T) => OdooModule) => OdooModule;

class ModuleLoader {
    define: OdooModuleDefineFn;
    factories: Map<string, OdooModuleFactory>;
    failed: Set<string>;
    jobs: Set<string>;
    modules: Map<string, OdooModule>;
}

declare const odoo: {
    csrf_token: string;
    debug: string;
    define: OdooModuleDefineFn;
    loader: ModuleLoader;
};
