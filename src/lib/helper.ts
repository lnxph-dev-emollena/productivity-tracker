import { PrismaClient, Project, User, Ticket, } from '@prisma/client';
import axios from 'axios';

interface Repo {
  full_name: string;
}

interface PRLike {
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

  const project = await prisma.project.findUnique({
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

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error("GITHUB_TOKEN is not set in environment variables");
  }
  while (true) {
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
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
