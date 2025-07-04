import { PrismaClient, Project, User, Ticket } from '@prisma/client';

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


export const countAddedRemovedLines = (diffText: String)  => {
  const lines = diffText.split('\n');
  let added = 0, removed = 0;

  for (let line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      added++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removed++;
    }
  }

  return { added, removed, total: added + removed };
}