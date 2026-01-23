import { WorkerChannelHub, WorkerChannelController } from "@bus/workers/worker_hub";

export class ElectionWorker extends WorkerChannelController {
    MAIN_TAB_TIMEOUT_PERIOD = 3000;

    /** @type {Set<MessagePort>} */
    candidates = new Set();
    /** @type {PromiseWithResolvers<void>|null} */
    electionResolver = null;
    /** @type {number|null} */
    heartbeatRequestInterval = null;
    lastHeartbeat = Date.now();
    /** @type {PromiseWithResolvers<void>|null} */
    masterReplyResolver = null;
    /** @type {MessagePort|null} */
    masterTab = null;

    constructor() {
        super(...arguments);
        setInterval(() => {
            if (Date.now() - this.lastHeartbeat > this.MAIN_TAB_TIMEOUT_PERIOD) {
                this.startElection();
            }
        }, this.MAIN_TAB_TIMEOUT_PERIOD);
    }

    requestHeartbeat(messagePort) {
        if (messagePort) {
            messagePort.postMessage({ type: "HEARTBEAT_REQUEST" });
            return;
        }
        for (const candidate of this.candidates) {
            candidate.postMessage({ type: "HEARTBEAT_REQUEST" });
        }
    }

    async ensureMasterPresence() {
        this.masterReplyResolver ??= Promise.withResolvers();
        if (this.masterTab) {
            this.requestHeartbeat(this.masterTab);
        } else {
            this.startElection();
        }
        await this.masterReplyResolver?.promise;
    }

    startElection() {
        clearInterval(this.heartbeatRequestInterval);
        this.masterTab?.postMessage({ type: "UNASSIGN_MASTER" });
        this.masterTab = null;
        this.electionResolver ??= Promise.withResolvers();
        this.requestHeartbeat();
    }

    finishElection(messagePort) {
        this.masterTab = messagePort;
        messagePort.postMessage({ type: "ASSIGN_MASTER" });
        this.electionResolver.resolve();
        this.electionResolver = null;
        this.heartbeatRequestInterval = setInterval(
            () => this.requestHeartbeat(this.masterTab),
            this.MAIN_TAB_TIMEOUT_PERIOD / 2
        );
    }

    async handleRequest(client, action, data) {
        switch (action) {
            case "REGISTER":
                this.candidates.add(client);
                await this.electionResolver?.promise;
                if (!this.masterTab) {
                    this.startElection();
                }
                break;
            case "UNREGISTER":
                this.candidates.delete(client);
                if (this.masterTab === client) {
                    this.startElection();
                }
                break;
            case "IS_MASTER?":
                await this.ensureMasterPresence();
                return { answer: this.masterTab === client };
            case "HEARTBEAT":
                if (this.electionResolver) {
                    this.finishElection(client);
                }
                if (this.masterTab === client) {
                    this.lastHeartbeat = Date.now();
                    this.masterReplyResolver?.resolve();
                    this.masterReplyResolver = null;
                }
                break;
            default:
                console.warn("Unknown message action:", action);
        }
    }
}

WorkerChannelHub.register("ELECTION", ElectionWorker);
