declare class VToggler {
    key: string;
    child: VNode;
    parentEl?: HTMLElement | undefined;
    constructor(key: string, child: VNode);
    mount(parent: HTMLElement, afterNode: Node | null): void;
    moveBeforeDOMNode(node: Node | null, parent?: HTMLElement): void;
    moveBeforeVNode(other: VToggler | null, afterNode: Node | null): void;
    patch(other: VToggler, withBeforeRemove: boolean): void;
    beforeRemove(): void;
    remove(): void;
    firstNode(): Node | undefined;
    toString(): string;
}
declare function toggler(key: string, child: VNode): VNode<VToggler>;

type BlockType = (data?: any[], children?: VNode[]) => VNode;
/**
 * Compiling blocks is a multi-step process:
 *
 * 1. build an IntermediateTree from the HTML element. This intermediate tree
 *    is a binary tree structure that encode dynamic info sub nodes, and the
 *    path required to reach them
 * 2. process the tree to build a block context, which is an object that aggregate
 *    all dynamic info in a list, and also, all ref indexes.
 * 3. process the context to build appropriate builder/setter functions
 * 4. make a dynamic block class, which will efficiently collect references and
 *    create/update dynamic locations/children
 *
 * @param str
 * @returns a new block type, that can build concrete blocks
 */
declare function createBlock(str: string): BlockType;

declare class VList {
    children: VNode[];
    anchor: Node | undefined;
    parentEl?: HTMLElement | undefined;
    isOnlyChild?: boolean | undefined;
    constructor(children: VNode[]);
    mount(parent: HTMLElement, afterNode: Node | null): void;
    moveBeforeDOMNode(node: Node | null, parent?: HTMLElement | undefined): void;
    moveBeforeVNode(other: VList | null, afterNode: Node | null): void;
    patch(other: VList, withBeforeRemove: boolean): void;
    beforeRemove(): void;
    remove(): void;
    firstNode(): Node | undefined;
    toString(): string;
}
declare function list(children: VNode[]): VNode<VList>;

declare class VMulti {
    children: (VNode | undefined)[];
    anchors?: Node[] | undefined;
    parentEl?: HTMLElement | undefined;
    isOnlyChild?: boolean | undefined;
    constructor(children: (VNode | undefined)[]);
    mount(parent: HTMLElement, afterNode: Node | null): void;
    moveBeforeDOMNode(node: Node | null, parent?: HTMLElement | undefined): void;
    moveBeforeVNode(other: VMulti | null, afterNode: Node | null): void;
    patch(other: VMulti, withBeforeRemove: boolean): void;
    beforeRemove(): void;
    remove(): void;
    firstNode(): Node | undefined;
    toString(): string;
}
declare function multi(children: (VNode | undefined)[]): VNode<VMulti>;

declare abstract class VSimpleNode {
    text: string | String;
    parentEl?: HTMLElement | undefined;
    el?: any;
    constructor(text: string | String);
    mountNode(node: Node, parent: HTMLElement, afterNode: Node | null): void;
    moveBeforeDOMNode(node: Node | null, parent?: HTMLElement | undefined): void;
    moveBeforeVNode(other: VText | null, afterNode: Node | null): void;
    beforeRemove(): void;
    remove(): void;
    firstNode(): Node;
    toString(): string | String;
}
declare class VText extends VSimpleNode {
    mount(parent: HTMLElement, afterNode: Node | null): void;
    patch(other: VText): void;
}
declare class VComment extends VSimpleNode {
    mount(parent: HTMLElement, afterNode: Node | null): void;
    patch(): void;
}
declare function text(str: string | String): VNode<VText>;
declare function comment(str: string): VNode<VComment>;

declare class VHtml {
    html: string;
    parentEl?: HTMLElement | undefined;
    content: ChildNode[];
    constructor(html: string);
    mount(parent: HTMLElement, afterNode: Node | null): void;
    moveBeforeDOMNode(node: Node | null, parent?: HTMLElement | undefined): void;
    moveBeforeVNode(other: VHtml | null, afterNode: Node | null): void;
    patch(other: VHtml): void;
    beforeRemove(): void;
    remove(): void;
    firstNode(): Node;
    toString(): string;
}
declare function html(str: string): VNode<VHtml>;

interface VNode<T = any> {
    mount(parent: HTMLElement, afterNode: Node | null): void;
    moveBeforeDOMNode(node: Node | null, parent?: HTMLElement): void;
    moveBeforeVNode(other: T | null, afterNode: Node | null): void;
    patch(other: T, withBeforeRemove: boolean): void;
    beforeRemove(): void;
    remove(): void;
    firstNode(): Node | undefined;
    el?: undefined | HTMLElement | Text;
    parentEl?: undefined | HTMLElement;
    isOnlyChild?: boolean | undefined;
    key?: any;
}
type BDom = VNode<any>;
declare function mount$1(vnode: VNode, fixture: HTMLElement, afterNode?: Node | null): void;
declare function patch(vnode1: VNode, vnode2: VNode, withBeforeRemove?: boolean): void;
declare function remove(vnode: VNode, withBeforeRemove?: boolean): void;

declare enum ComputationState {
    EXECUTED = 0,
    STALE = 1,
    PENDING = 2
}
type Computation<T = any> = {
    compute?: () => T;
    state: ComputationState;
    sources: Set<Atom | Derived<any, any>>;
    isEager?: boolean;
    isDerived?: boolean;
    value: T;
    childrenEffect?: Computation[];
} & Opts;
type Opts = {
    name?: string;
};
type Atom<T = any> = {
    value: T;
    observers: Set<Computation>;
} & Opts;
interface Derived<Prev, Next = Prev> extends Atom<Next>, Computation<Next> {
}
declare function untrack<T extends (...args: any[]) => any>(fn: T): ReturnType<T>;

type ReactiveValue<T> = () => T;
interface Signal<T> extends ReactiveValue<T> {
    /**
     * Update the value of the signal with a new value. If the new value is different
     * from the previous values, all computations that depends on this signal will
     * be invalidated, and effects will rerun.
     */
    set(value: T): void;
    /**
     * Call the updater function (if given) to update the signal value.
     * If the updater value is not given, then all computations that depends on
     * this signal will be invalidated and effects will rerun.
     */
    update(updater?: (value: T) => T): void;
}
declare function signal<T>(value: T, opts?: Opts): Signal<T>;

type BaseType = {
    new (...args: any[]): any;
} | true | "*";
interface TypeInfo {
    type?: TypeDescription;
    optional?: boolean;
    validate?: Function;
    shape?: Schema;
    element?: TypeDescription;
    values?: TypeDescription;
}
type ValueType = {
    value: any;
};
type TypeDescription = BaseType | TypeInfo | ValueType | TypeDescription[];
type SimplifiedSchema = string[];
type NormalizedSchema = {
    [key: string]: TypeDescription;
};
type Schema = SimplifiedSchema | NormalizedSchema;
/**
 * Main validate function
 */
declare function validate(obj: {
    [key: string]: any;
}, spec: Schema): void;
declare function validateType(key: string, value: any, descr: TypeDescription): string | null;

declare class Resource<T> {
    private _items;
    private _name;
    private _type?;
    constructor(name?: string, type?: TypeDescription);
    items: ReactiveValue<T[]>;
    add(item: T, sequence?: number): Resource<T>;
    remove(item: T): Resource<T>;
}
declare function useResource<T>(r: Resource<T>, elements: T[]): void;

declare class Registry<T> {
    _map: Signal<{
        [key: string]: [number, T];
    }>;
    _name: string;
    _type?: TypeDescription;
    constructor(name?: string, type?: TypeDescription);
    entries: ReactiveValue<[string, T][]>;
    items: ReactiveValue<T[]>;
    addById<U extends {
        id: string;
    } & T>(item: U, sequence?: number): Registry<T>;
    add(key: string, value: T, sequence?: number): Registry<T>;
    get(key: string, defaultValue?: T): T;
    remove(key: string): void;
}

declare const enum STATUS {
    NEW = 0,
    MOUNTED = 1,
    CANCELLED = 2,
    DESTROYED = 3
}
type STATUS_DESCR = "new" | "started" | "mounted" | "cancelled" | "destroyed";
declare function status(): () => STATUS_DESCR;

interface PluginConstructor {
    new (): Plugin;
    id: string;
}
declare class Plugin {
    static id: string;
    setup(): void;
}
declare class PluginManager {
    private children;
    private parent;
    private plugins;
    private onDestroyCb;
    status: STATUS;
    constructor(parent: PluginManager | null);
    destroy(): void;
    getPluginById<T extends Plugin>(id: string): T | null;
    getPlugin<T extends PluginConstructor>(pluginType: T): InstanceType<T> | null;
    startPlugins(pluginTypes: PluginConstructor[]): Plugin[];
}
declare function plugin<T extends PluginConstructor>(pluginType: T): InstanceType<T>;

declare class Fiber {
    node: ComponentNode;
    bdom: BDom | null;
    root: RootFiber | null;
    parent: Fiber | null;
    children: Fiber[];
    appliedToDom: boolean;
    deep: boolean;
    childrenMap: ComponentNode["children"];
    constructor(node: ComponentNode, parent: Fiber | null);
    render(): void;
    _render(): void;
}
declare class RootFiber extends Fiber {
    counter: number;
    willPatch: Fiber[];
    patched: Fiber[];
    mounted: Fiber[];
    locked: boolean;
    complete(): void;
    setCounter(newValue: number): void;
}
type Position = "first-child" | "last-child";
interface MountOptions {
    position?: Position;
}
declare class MountFiber extends RootFiber {
    target: HTMLElement;
    position: Position;
    constructor(node: ComponentNode, target: HTMLElement, options?: MountOptions);
    complete(): void;
}

declare function useComponent(): Component;
type LifecycleHook = Function;
declare class ComponentNode implements VNode<ComponentNode> {
    el?: HTMLElement | Text | undefined;
    app: App;
    fiber: Fiber | null;
    component: Component;
    bdom: BDom | null;
    status: STATUS;
    forceNextRender: boolean;
    parentKey: string | null;
    name: string;
    props: Record<string, any>;
    renderFn: Function;
    parent: ComponentNode | null;
    children: {
        [key: string]: ComponentNode;
    };
    willStart: LifecycleHook[];
    willUpdateProps: LifecycleHook[];
    willUnmount: LifecycleHook[];
    mounted: LifecycleHook[];
    willPatch: LifecycleHook[];
    patched: LifecycleHook[];
    willDestroy: LifecycleHook[];
    signalComputation: Computation;
    pluginManager: PluginManager;
    constructor(C: ComponentConstructor, props: Record<string, any>, app: App, parent: ComponentNode | null, parentKey: string | null);
    mountComponent(target: any, options?: MountOptions): void;
    initiateRender(fiber: Fiber | MountFiber): Promise<void>;
    render(deep: boolean): Promise<void>;
    cancel(): void;
    _cancel(): void;
    destroy(): void;
    _destroy(): void;
    updateAndRender(props: Record<string, any>, parentFiber: Fiber): Promise<void>;
    /**
     * Finds a child that has dom that is not yet updated, and update it. This
     * method is meant to be used only in the context of repatching the dom after
     * a mounted hook failed and was handled.
     */
    updateDom(): void;
    firstNode(): Node | undefined;
    mount(parent: HTMLElement, anchor: ChildNode): void;
    moveBeforeDOMNode(node: Node | null, parent?: HTMLElement): void;
    moveBeforeVNode(other: ComponentNode | null, afterNode: Node | null): void;
    patch(): void;
    _patch(): void;
    beforeRemove(): void;
    remove(): void;
}

interface StaticComponentProperties {
    template: string;
    components?: {
        [componentName: string]: ComponentConstructor;
    };
}
interface ComponentConstructor extends StaticComponentProperties {
    new (node: ComponentNode): Component;
}
declare class Component {
    static template: string;
    __owl__: ComponentNode;
    constructor(node: ComponentNode);
    setup(): void;
    render(deep?: boolean): void;
}

type ErrorParams = {
    error: any;
} & ({
    node: ComponentNode;
} | {
    fiber: Fiber;
});
declare function handleError(params: ErrorParams): void;

type Target = object;
type Reactive<T extends Target> = T;
/**
 * Mark an object or array so that it is ignored by the reactivity system
 *
 * @param value the value to mark
 * @returns the object itself
 */
declare function markRaw<T extends Target>(value: T): T;
/**
 * Given a proxy objet, return the raw (non proxy) underlying object
 *
 * @param value a proxy value
 * @returns the underlying value
 */
declare function toRaw<T extends Target, U extends Reactive<T>>(value: U | T): T;
/**
 * Creates a reactive proxy for an object. Reading data on the proxy object
 * subscribes to changes to the data. Writing data on the object will cause the
 * notify callback to be called if there are suscriptions to that data. Nested
 * objects and arrays are automatically made reactive as well.
 *
 * Whenever you are notified of a change, all subscriptions are cleared, and if
 * you would like to be notified of any further changes, you should go read
 * the underlying data again. We assume that if you don't go read it again after
 * being notified, it means that you are no longer interested in that data.
 *
 * Subscriptions:
 * + Reading a property on an object will subscribe you to changes in the value
 *    of that property.
 * + Accessing an object's keys (eg with Object.keys or with `for..in`) will
 *    subscribe you to the creation/deletion of keys. Checking the presence of a
 *    key on the object with 'in' has the same effect.
 * - getOwnPropertyDescriptor does not currently subscribe you to the property.
 *    This is a choice that was made because changing a key's value will trigger
 *    this trap and we do not want to subscribe by writes. This also means that
 *    Object.hasOwnProperty doesn't subscribe as it goes through this trap.
 *
 * @param target the object for which to create a proxy proxy
 * @param callback the function to call when an observed property of the
 *  proxy has changed
 * @returns a proxy that tracks changes to it
 */
declare function proxy<T extends Target>(target: T): T;

declare class Scheduler {
    static requestAnimationFrame: ((callback: FrameRequestCallback) => number) & typeof requestAnimationFrame;
    tasks: Set<RootFiber>;
    requestAnimationFrame: Window["requestAnimationFrame"];
    frame: number;
    delayedRenders: Fiber[];
    cancelledNodes: Set<ComponentNode>;
    processing: boolean;
    constructor();
    addFiber(fiber: Fiber): void;
    scheduleDestroy(node: ComponentNode): void;
    /**
     * Process all current tasks. This only applies to the fibers that are ready.
     * Other tasks are left unchanged.
     */
    flush(): void;
    processTasks(): void;
    processFiber(fiber: RootFiber): void;
}

interface Config {
    translateFn?: (s: string, translationCtx: string) => string;
    translatableAttributes?: string[];
    dev?: boolean;
}

type CustomDirectives = Record<string, (node: Element, value: string, modifier: string[]) => void>;
type Template = (context: any, vnode: any, key?: string) => BDom;
type TemplateFunction = (app: TemplateSet, bdom: any, helpers: any) => Template;
interface CompileOptions extends Config {
    name?: string;
    customDirectives?: CustomDirectives;
    hasGlobalValues: boolean;
}
declare function compile(template: string | Element, options?: CompileOptions): TemplateFunction;

type ConstructorTypedPropsValidation<T = any> = new (...args: any) => T;
type UnionTypedPropsValidation = ReadonlyArray<TypedPropsValidation>;
type OptionalSchemaTypedPropsValidation<O extends boolean> = {
    optional: O;
};
type DefaultValuedSchemaTypedPropsValidation<T> = {
    defaultValue: T;
};
type ValidableSchemaTypedPropsValidation = {
    validate(value: any): boolean;
};
type TypeSchemaTypedPropsValidation<T> = {
    type: new (...args: any) => T;
};
type MapSchemaTypedPropsValidation = {
    type: ObjectConstructor;
    shape: PropsValidation;
};
type RecordSchemaTypedPropsValidation = {
    type: ObjectConstructor;
    values: TypedPropsValidation;
};
type ArraySchemaTypedPropsValidation = {
    type: ArrayConstructor;
    element: TypedPropsValidation;
};
type SchemaTypedPropsValidation<T, O extends boolean> = {
    type?: new (...args: any) => T;
    optional?: O;
    defaultValue?: T;
    validate?(value: T): boolean;
    shape?: PropsValidation;
    values?: TypedPropsValidation;
    element?: TypedPropsValidation;
};
type ValueTypedPropsValidation<T = any> = {
    value: T;
};
type TypedPropsValidation = true | ConstructorTypedPropsValidation | UnionTypedPropsValidation | SchemaTypedPropsValidation<any, boolean> | ValueTypedPropsValidation;
type RecordPropsValidation = Record<string, TypedPropsValidation>;
type KeysPropsValidation = readonly string[];
type PropsValidation = RecordPropsValidation | KeysPropsValidation;
type ConvertTypedPropsValidation<V extends TypedPropsValidation> = V extends true ? any : V extends ConstructorTypedPropsValidation<infer I> ? I : V extends UnionTypedPropsValidation ? V[number] : V extends MapSchemaTypedPropsValidation ? ConvertPropsValidation<V["shape"]> : V extends RecordSchemaTypedPropsValidation ? Record<string, ConvertTypedPropsValidation<V["values"]>> : V extends ArraySchemaTypedPropsValidation ? ConvertTypedPropsValidation<V["element"]>[] : V extends TypeSchemaTypedPropsValidation<infer I> ? I : V extends ValueTypedPropsValidation<infer T> ? T : V extends DefaultValuedSchemaTypedPropsValidation<infer T> ? T : V extends OptionalSchemaTypedPropsValidation<boolean> ? any : V extends ValidableSchemaTypedPropsValidation ? any : never;
type ConvertPropsValidation<V extends PropsValidation> = V extends KeysPropsValidation ? {
    [K in V[number] as K extends `${infer N}?` ? N : never]?: any;
} & {
    [K in V[number] as K extends `${string}?` ? never : K]: any;
} : V extends RecordPropsValidation ? {
    [K in keyof V as V[K] extends OptionalSchemaTypedPropsValidation<true> ? K : never]?: ConvertTypedPropsValidation<V[K]>;
} & {
    [K in keyof V as V[K] extends OptionalSchemaTypedPropsValidation<true> ? never : K]: ConvertTypedPropsValidation<V[K]>;
} : never;
declare const isProps: unique symbol;
type IsPropsObj = {
    [isProps]: true;
};
type Props<T, V extends PropsValidation> = IsPropsObj & (unknown extends T ? ConvertPropsValidation<V> : T);
type GetProps<T extends Component> = {
    [K in keyof T]: T[K] extends IsPropsObj ? (x: Omit<T[K], typeof isProps>) => void : never;
}[keyof T] extends (x: infer I) => void ? {
    [K in keyof I]: I[K];
} : never;
declare function props<T = unknown, V extends PropsValidation = PropsValidation>(validation?: V): Props<T, V>;

declare class Portal extends Component {
    static template: string;
    props: Props<unknown, {
        target: StringConstructor;
        slots: true;
    }>;
    setup(): void;
}

interface TemplateSetConfig {
    dev?: boolean;
    translatableAttributes?: string[];
    translateFn?: (s: string, translationCtx: string) => string;
    templates?: string | Document | Record<string, string>;
    getTemplate?: (s: string) => Element | Function | string | void;
    customDirectives?: CustomDirectives;
    globalValues?: object;
}
declare class TemplateSet {
    static registerTemplate(name: string, fn: TemplateFunction): void;
    dev: boolean;
    rawTemplates: typeof globalTemplates;
    templates: {
        [name: string]: Template;
    };
    getRawTemplate?: (s: string) => Element | Function | string | void;
    translateFn?: (s: string, translationCtx: string) => string;
    translatableAttributes?: string[];
    Portal: typeof Portal;
    customDirectives: CustomDirectives;
    runtimeUtils: object;
    hasGlobalValues: boolean;
    constructor(config?: TemplateSetConfig);
    addTemplate(name: string, template: string | Element): void;
    addTemplates(xml: string | Document): void;
    getTemplate(name: string): Template;
    _compileTemplate(name: string, template: string | Element): ReturnType<typeof compile>;
    callTemplate(owner: any, subTemplate: string, ctx: any, parent: any, key: any): any;
}
declare const globalTemplates: {
    [key: string]: string | Element | TemplateFunction;
};
declare function xml(...args: Parameters<typeof String.raw>): string;
declare namespace xml {
    var nextId: number;
}

type Callback = () => void;
/**
 * Creates a batched version of a callback so that all calls to it in the same
 * microtick will only call the original callback once.
 *
 * @param callback the callback to batch
 * @returns a batched version of the original callback
 */
declare function batched(callback: Callback): Callback;
declare function validateTarget(target: HTMLElement | ShadowRoot): void;
declare class EventBus extends EventTarget {
    trigger(name: string, payload?: any): void;
}
declare function whenReady(fn?: any): Promise<void>;
declare class Markup extends String {
}
declare function htmlEscape(str: any): Markup;
declare function markup(strings: TemplateStringsArray, ...placeholders: unknown[]): Markup;
declare function markup(value: string): Markup;

type ComponentInstance<C extends ComponentConstructor> = C extends new (...args: any) => infer T ? T : never;
interface RootConfig<P> {
    pluginManager?: PluginManager;
    props?: P;
}
interface AppConfig extends TemplateSetConfig {
    name?: string;
    pluginManager?: PluginManager;
    test?: boolean;
}
declare global {
    interface Window {
        __OWL_DEVTOOLS__: {
            apps: Set<App>;
            Fiber: typeof Fiber;
            RootFiber: typeof RootFiber;
            toRaw: typeof toRaw;
            proxy: typeof proxy;
        };
    }
}
type MountTarget = HTMLElement | ShadowRoot;
interface Root<T extends ComponentConstructor> {
    node: ComponentNode;
    promise: Promise<ComponentInstance<T>>;
    mount(target: MountTarget, options?: MountOptions): Promise<ComponentInstance<T>>;
    destroy(): void;
}
declare class App extends TemplateSet {
    static validateTarget: typeof validateTarget;
    static apps: Set<App>;
    static version: string;
    name: string;
    scheduler: Scheduler;
    roots: Set<Root<any>>;
    pluginManager: PluginManager;
    constructor(config?: AppConfig);
    createRoot<T extends ComponentConstructor>(Root: T, config?: RootConfig<GetProps<ComponentInstance<T>>>): Root<T>;
    makeNode<T extends ComponentConstructor>(Component: T, props: GetProps<ComponentInstance<T>>): ComponentNode;
    mountNode(node: ComponentNode, target: HTMLElement | ShadowRoot, resolve: (c: any) => void, reject: (e: any) => void, options?: MountOptions): void;
    destroy(): void;
    createComponent<P extends Record<string, any>>(name: string | null, isStatic: boolean, hasSlotsProp: boolean, hasDynamicPropList: boolean, propList: string[]): (props: P, key: string, ctx: ComponentNode, parent: any, C: any) => any;
    handleError(...args: Parameters<typeof handleError>): void;
}
declare function mount<T extends ComponentConstructor>(C: T, target: MountTarget, config?: AppConfig & RootConfig<GetProps<ComponentInstance<T>>> & MountOptions): Promise<ComponentInstance<T>>;

declare function computed<T>(fn: () => T, opts?: Opts): ReactiveValue<T>;

declare function effect<T>(fn: () => T, opts?: Opts): () => void;

type EffectDeps<T extends unknown[]> = T | (T extends [...infer H, never] ? EffectDeps<H> : never);
/**
 * @template T
 * @param {...T} dependencies the dependencies computed by computeDependencies
 * @returns {void|(()=>void)} a cleanup function that reverses the side
 *      effects of the effect callback.
 */
type Effect<T extends unknown[]> = (...dependencies: EffectDeps<T>) => void | (() => void);
/**
 * This hook will run a callback when a component is mounted and patched, and
 * will run a cleanup function before patching and before unmounting the
 * the component.
 *
 * @template T
 * @param {Effect<T>} effect the effect to run on component mount and/or patch
 * @param {()=>[...T]} [computeDependencies=()=>[NaN]] a callback to compute
 *      dependencies that will decide if the effect needs to be cleaned up and
 *      run again. If the dependencies did not change, the effect will not run
 *      again. The default value returns an array containing only NaN because
 *      NaN !== NaN, which will cause the effect to rerun on every patch.
 */
declare function useEffect<T extends unknown[]>(effect: Effect<T>, computeDependencies?: () => [...T]): void;
/**
 * When a component needs to listen to DOM Events on element(s) that are not
 * part of his hierarchy, we can use the `useListener` hook.
 * It will correctly add and remove the event listener, whenever the
 * component is mounted and unmounted.
 *
 * Example:
 *  a menu needs to listen to the click on window to be closed automatically
 *
 * Usage:
 *  in the constructor of the OWL component that needs to be notified,
 *  `useListener(window, 'click', this._doSomething);`
 * */
declare function useListener(target: EventTarget, eventName: string, handler: EventListener, eventParams?: AddEventListenerOptions): void;
declare function usePlugins(Plugins: PluginConstructor[]): Plugin[];

declare function onWillStart(fn: () => Promise<void> | void | any): void;
declare function onWillUpdateProps(fn: (nextProps: any) => Promise<void> | void | any): void;
declare function onMounted(fn: () => void | any): void;
declare function onWillPatch(fn: () => any | void): void;
declare function onPatched(fn: () => void | any): void;
declare function onWillUnmount(fn: () => void | any): void;
declare function onWillDestroy(fn: () => void | any): void;
type OnErrorCallback = (error: any) => void | any;
declare function onError(callback: OnErrorCallback): void;

declare class OwlError extends Error {
    cause?: any;
}

declare const blockDom: {
    config: {
        shouldNormalizeDom: boolean;
        mainEventHandler: (data: any, ev: Event, currentTarget?: EventTarget | null | undefined) => boolean;
    };
    mount: typeof mount$1;
    patch: typeof patch;
    remove: typeof remove;
    list: typeof list;
    multi: typeof multi;
    text: typeof text;
    toggler: typeof toggler;
    createBlock: typeof createBlock;
    html: typeof html;
    comment: typeof comment;
};

declare const __info__: {
    version: string;
};

export { App, Component, ComponentConstructor, EventBus, GetProps, OwlError, Plugin, PluginConstructor, PluginManager, PropsValidation, Registry, Resource, __info__, batched, blockDom, computed, effect, htmlEscape, markRaw, markup, mount, onError, onMounted, onPatched, onWillDestroy, onWillPatch, onWillStart, onWillUnmount, onWillUpdateProps, plugin, props, proxy, signal, status, toRaw, untrack, useComponent, useEffect, useListener, usePlugins, useResource, validate, validateType, whenReady, xml };
