declare module '@octokit/rest' {
  export class Octokit {
    constructor(options: { auth: string; baseUrl?: string; userAgent?: string });
    rest: {
      issues: {
        get(params: { owner: string; repo: string; issue_number: number }): Promise<{ data: any }>;
        listForRepo(params: { owner: string; repo: string; state?: string; per_page?: number }): Promise<{ data: any[] }>;
        createComment(params: { owner: string; repo: string; issue_number: number; body: string }): Promise<any>;
        update(params: { owner: string; repo: string; issue_number: number; state: string }): Promise<any>;
      };
      repos: {
        get(params: { owner: string; repo: string }): Promise<{ data: { default_branch: string } }>;
        listCommits(params: { owner: string; repo: string; sha: string; per_page?: number; since?: string }): Promise<{ data: any[] }>;
        getCommit(params: { owner: string; repo: string; ref: string }): Promise<{ data: { sha: string; commit: { message: string; author: { name: string; date: string } }; files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }> } }>;
        getContent(params: { owner: string; repo: string; path: string; ref?: string }): Promise<any>;
      };
      pulls: {
        create(params: { owner: string; repo: string; title: string; head: string; base: string; body?: string; draft?: boolean }): Promise<any>;
        createReview(params: { owner: string; repo: string; pull_number: number; event: "APPROVE" | "COMMENT" | "REQUEST_CHANGES"; body?: string }): Promise<any>;
        merge(params: { owner: string; repo: string; pull_number: number; merge_method?: "merge" | "squash" | "rebase" }): Promise<any>;
      };
      issues: {
        get(params: { owner: string; repo: string; issue_number: number }): Promise<{ data: any }>;
        listForRepo(params: { owner: string; repo: string; state?: string; per_page?: number }): Promise<{ data: any[] }>;
        createComment(params: { owner: string; repo: string; issue_number: number; body: string }): Promise<any>;
      };
      pulls: {
        create(params: { owner: string; repo: string; title: string; head: string; base: string; body?: string; draft?: boolean }): Promise<any>;
        createReview(params: { owner: string; repo: string; pull_number: number; event: "APPROVE" | "COMMENT" | "REQUEST_CHANGES"; body?: string }): Promise<any>;
        merge(params: { owner: string; repo: string; pull_number: number; merge_method?: "merge" | "squash" | "rebase" }): Promise<any>;
      };
      repos: {
        get(params: { owner: string; repo: string }): Promise<{ data: { default_branch: string } }>;
        listCommits(params: { owner: string; repo: string; sha: string; per_page?: number; since?: string }): Promise<{ data: any[] }>;
        getCommit(params: { owner: string; repo: string; ref: string }): Promise<any>;
      };
    };
  }
}