declare type MaybePromise<T> = T | Promise<T>;
declare type MaybeFunction<T, Args extends any[] = []> = T | ((...args: Args) => T);
