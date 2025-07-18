import axios from 'axios';
import { PrismaClient, Project, User, Ticket, } from '@prisma/client';
import { CommitStats, GitHubPushPayload, PRLike, Repo } from './interface';


const GITHUB_TOKEN = process.env.WEBHOOK_GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  throw new Error("WEBHOOK_GITHUB_TOKEN is not set in environment variables");
}


export const resolveEntities = async (
  prisma: PrismaClient,
  pr: PRLike,
  repo: Repo
): Promise<{
  user: User;
  project: Project;
  ticket: Ticket | null;
}> => {
  const branch = pr.head?.ref || pr.ref || "unknown";
  const username = pr.user?.login || pr.sender?.login;

  const ticketCodeMatch = branch.match(/([A-Z]+-\d+)/i);
  const ticketCode = ticketCodeMatch ? ticketCodeMatch[1].toUpperCase() : null;

  const project = await prisma.project.findFirst({
    where: { repository: repo.full_name },
  });
  if (!project) throw new Error("Project not found");

  const user = await prisma.user.findUnique({
    where: { username },
  });
  if (!user) throw new Error("User not found");

  let ticket: Ticket | null = null;
  if (ticketCode) {
    ticket = await prisma.ticket.findUnique({
      where: { code: ticketCode },
    });
  }

  return {
    project,
    user,
    ticket,
  };
};



export const getChangedFilesDetails = async (repoFullName: string, prNumber: number): Promise<{ additions: number; deletions: number; changedFiles: number }> => {
  const [owner, repo] = repoFullName.split("/");
  let files: any[] = [];
  let page = 1;

  while (true) {
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json"
        },
        params: { per_page: 100, page }
      }
    );

    files = files.concat(response.data);

    if (response.data.length < 100) break;
    page++;
  }

  const filteredFiles = files.filter(file =>
    !file.filename.match(/(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/)
  );

  const additions = filteredFiles.reduce((sum, f) => sum + f.additions, 0);
  const deletions = filteredFiles.reduce((sum, f) => sum + f.deletions, 0);
  const changedFiles = filteredFiles.length;

  return { additions, deletions, changedFiles };
};

export async function fetchPushCommitStats(
  payload: GitHubPushPayload
): Promise<{ totalAdditions: number; totalDeletions: number; }> {
  const owner = payload.repository.owner.login || payload.repository.owner.name!;
  const repo = payload.repository.name!;

  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const commit of payload.commits) {
    const sha = commit.id;
    try {
      const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/commits/${sha}`, {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
      });

      const stats = response.data.stats as CommitStats;

      totalAdditions += stats.additions;
      totalDeletions += stats.deletions;

    } catch (error: any) {
      console.error(`Failed to fetch stats for commit ${sha}:`, error?.response?.data || error.message);
    }
  }

  return { totalAdditions, totalDeletions };
}
