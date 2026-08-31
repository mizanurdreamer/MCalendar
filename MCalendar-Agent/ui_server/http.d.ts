import { APPROVAL_TYPE } from "../src/utils/constants.js";
import { getPendingApprovals as getStoredApprovals, resolveApproval as resolveStoredApproval, createApprovalRequest as createStoredApproval } from "../src/core/approval_store.js";
export interface ApprovalRequest {
    id: string;
    agent: string;
    type: typeof APPROVAL_TYPE[keyof typeof APPROVAL_TYPE];
    title: string;
    description: string;
    data: any;
    options: {
        label: string;
        value: string;
    }[];
    defaultOption?: string;
    createdAt: number;
    resolved?: boolean;
    resolution?: string;
}
export declare const createApprovalRequest: typeof createStoredApproval;
export declare const getPendingApprovals: typeof getStoredApprovals;
export declare const resolveApproval: typeof resolveStoredApproval;
export interface WebServerOptions {
    port?: number;
    host?: string;
}
export declare function startWebServer(options?: WebServerOptions): Promise<void>;
