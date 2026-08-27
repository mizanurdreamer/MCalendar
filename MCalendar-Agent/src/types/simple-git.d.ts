declare module 'simple-git' {
  export interface SimpleGitOptions {
    baseDir?: string;
    binary?: string;
    maxConcurrentProcesses?: number;
  }

  export interface SimpleGit {
    init(): Promise<string>;
    clone(repoUrl: string, localPath: string, options?: string[]): Promise<string>;
    add(files: string | string[]): Promise<this>;
    commit(message: string): Promise<any>;
    push(remote?: string, branch?: string, options?: string[]): Promise<any>;
    pull(remote?: string, branch?: string, options?: string[]): Promise<any>;
    status(): Promise<{ current?: string }>;
    log(options?: { maxCount?: number }): Promise<any>;
    diff(args: string[]): Promise<string>;
    branch(args?: string[]): Promise<{ all: string[] }>;
    checkout(branch: string, options?: string[]): Promise<string>;
    merge(branch: string): Promise<any>;
    fetch(remote?: string, branch?: string): Promise<any>;
    branch(args?: string[]): Promise<{ all: string[] }>;
    checkout(branch: string, options?: string[]): Promise<string>;
    merge(branch: string): Promise<any>;
    raw(args: string[]): Promise<string>;
    fetch(remote?: string, branch?: string): Promise<any>;
    checkout(branch: string, options?: string[]): Promise<string>;
    checkoutLocalBranch(branchName: string): Promise<string>;
  }

  export function simpleGit(options?: SimpleGitOptions): SimpleGit;
  export function simpleGit(baseDir: string, options?: SimpleGitOptions): SimpleGit;
}