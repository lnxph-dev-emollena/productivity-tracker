export interface Repo {
  full_name: string;
}

export interface PRLike {
  head?: {
    ref?: string;
  };
  ref?: string;
  user?: {
    login?: string;
  };
  sender?: {
    login?: string;
  };
}

export interface Commit {
  id: string;
  url: string;
  committer: {
    name: string;
  };
}

export interface GitHubPushPayload {
  repository: {
    owner: { name?: string; login: string };
    name: string;
  };
  commits: Commit[];
  head_commit: Commit;
}

export interface CommitStats {
  additions: number;
  deletions: number;
  total: number;
}