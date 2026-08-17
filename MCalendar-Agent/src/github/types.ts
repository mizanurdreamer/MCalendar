export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels: GitHubLabel[];
  created_at: string;
  updated_at: string;
  html_url: string;
  user: { login: string };
  pull_request?: unknown;
}

export interface GitHubLabel {
  name: string;
  color: string;
}

export interface GitHubComment {
  id: number;
  body: string;
  created_at: string;
  user: { login: string };
}

export interface GitHubPR {
  number: number;
  html_url: string;
  title: string;
  state: string;
}

export interface GitHubBranch {
  name: string;
  ref: string;
  sha: string;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
}

export interface CommitFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface CommitDiff {
  sha: string;
  message: string;
  author: string;
  date: string;
  files: CommitFile[];
  totalAdditions: number;
  totalDeletions: number;
}
