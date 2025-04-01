export function ProtectedPromiseCreator(context) {
    class ProtectedPromise extends Promise {
        constructor(executor) {
            super(executor);
            this.context = context;
        }
        protectedThen(onFulfilled, onRejected) {
            const wrappedOnFulfilled = this.context.__colibri__.protectSyncAfterAsync(
                this.context,
                "protectedFunction",
                (value) => onFulfilled(value)
            );
            const wrappedOnRejected = this.context.__colibri__.protectSyncAfterAsync(
                this.context,
                "protectedFunction",
                (reason) => onRejected(reason)
            );
            return super.then(wrappedOnFulfilled, wrappedOnRejected);
        }
        protectedCatch(onRejected) {
            const wrappedOnRejected = this.context.__colibri__.protectSyncAfterAsync(
                this.context,
                "protectedFunction",
                (reason) => onRejected(reason)
            );
            return super.catch(wrappedOnRejected);
        }
    }
    ProtectedPromise.prototype.constructor = Promise;
    return ProtectedPromise;
}
