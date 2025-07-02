export const resolveEntities = async (prisma: any, pr: any, repo: any) => {
    const branch = pr.head?.ref || pr.ref || "unknown"; // fallback for push events
    const username = pr.user?.login || pr.sender?.login;
    const prNumber = pr.number;
    const additions = pr.additions ?? 0;
    const deletions = pr.deletions ?? 0;
    const changedFiles = pr.changed_files ?? 0;

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

    let ticket = null;
    if (ticketCode) {
        ticket = await prisma.ticket.findUnique({
            where: { code: ticketCode },
        });
    }

    const source = pr.url.includes("github") ? "github" : "unknown";

    return {
        branch,
        prNumber,
        additions,
        deletions,
        changedFiles,
        project,
        user,
        ticket,
        source
    };
}
