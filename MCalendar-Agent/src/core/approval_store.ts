import { readJson, writeJson } from "../utils/file.js";
import path from "node:path";
import type { AgentName } from "./state.js";
import { APPROVAL_TYPE } from "../utils/constants.js";

const APPROVAL_STORE_FILE = ".agent-context/approvals.json";

export interface StoredApprovalRequest {
  id: string;
  agent: AgentName;
  type: typeof APPROVAL_TYPE[keyof typeof APPROVAL_TYPE];
  title: string;
  description: string;
  data: any;
  options: { label: string; value: string }[];
  defaultOption?: string;
  createdAt: number;
  resolved?: boolean;
  resolution?: string;
}

function ensureDir(): void {
  const dir = path.dirname(APPROVAL_STORE_FILE);
  const fs = require("node:fs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadApprovals(): StoredApprovalRequest[] {
  try {
    ensureDir();
    const fs = require("node:fs");
    if (fs.existsSync(APPROVAL_STORE_FILE)) {
      return readJson<StoredApprovalRequest[]>(APPROVAL_STORE_FILE);
    }
  } catch {
    // ignore
  }
  return [];
}

function saveApprovals(approvals: StoredApprovalRequest[]): void {
  try {
    ensureDir();
    writeJson(APPROVAL_STORE_FILE, approvals);
  } catch (err) {
    // ignore
  }
}

export function createApprovalRequest(
  request: Omit<StoredApprovalRequest, "id" | "createdAt" | "resolved" | "resolution">
): StoredApprovalRequest {
  const approval: StoredApprovalRequest = {
    ...request,
    id: `approval-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: Date.now(),
    resolved: false,
  };
  
  const approvals = loadApprovals();
  approvals.unshift(approval);
  saveApprovals(approvals);
  
  return approval;
}

export function getPendingApprovals(): StoredApprovalRequest[] {
  const approvals = loadApprovals();
  return approvals.filter(a => !a.resolved).sort((a, b) => b.createdAt - a.createdAt);
}

export function resolveApproval(id: string, resolution: string): StoredApprovalRequest | null {
  const approvals = loadApprovals();
  const index = approvals.findIndex(a => a.id === id);
  if (index === -1) return null;
  
  approvals[index] = {
    ...approvals[index],
    resolved: true,
    resolution,
  };
  saveApprovals(approvals);
  return approvals[index];
}

export function getApprovalById(id: string): StoredApprovalRequest | null {
  const approvals = loadApprovals();
  return approvals.find(a => a.id === id) ?? null;
}