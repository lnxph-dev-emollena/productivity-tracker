import { PrismaClient, Project, Ticket, User } from "@prisma/client";
import axios from "axios";

export enum GitlabWeebhookEventType {
  NOTE = 'note',
  MERGE_REQUEST = 'merge_request',
  PUSH = 'push',
}

export enum WebhookDatabaseEventType {
  PUSHED = 'pushed',
  CHANGES_REQUESTED = 'changes_requested',
  OPENED = 'opened',
  APPROVED = 'approved',
  UNAPPROVED = 'unapproved',
  DISMISSED = 'dismissed',
  REOPEN = 'reopen',
  MERGED = 'merged',
}

interface MergeRequestStats {
  addition: number;
  deletions: number;
  total: number;
  changedFiles: number;
}

const GITLAB_SOURCE = 'gitlab';
const GITLAB_API_URL = process.env.GITLAB_HOST || 'https://gitlab.lanexus.com/api/v4';
const PRIVATE_TOKEN = process.env.GITLAB_PRIVATE_TOKEN || '9aBoc95g-vWi4ssjjj4d';
const IGNORE_BRANCHES = ["dev", "develop", "staging", "main", "prod", "production"];
const INITIAL_COMMIT_HASH = "0000000000000000000000000000000000000000";

export const getMrID = async (repositoryId: string, branchName: string): Promise<number | null> => {
  try {
    const { data } = await axios.get(`${GITLAB_API_URL}/projects/${repositoryId}/merge_requests`, {
      headers: { 'PRIVATE-TOKEN': PRIVATE_TOKEN },
      params: {
        state: 'opened',
        source_branch: branchName
      }
    });

    return data?.[0]?.iid ?? null;
  } catch (error: any) {
    console.error(`Failed to fetch active MR for branch "${branchName}":`, error.message);
    return null;
  }
};

const fetchMRStats = async (repositoryId: string, mrIid: string): Promise<MergeRequestStats | null> => {
  try {
    const response: any = await getMergeRequest(repositoryId, mrIid);
    const changes = response.changes;
    let totalAdded = 0;
    let totalRemoved = 0;
    let changedFiles = 0;

    changes.forEach((change: any) => {
      const diff = change.diff;
      const fileName = change.new_path;
      const lines = diff.split('\n');
      const containsLock = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(fileName);

      if (!containsLock) {
        for (const line of lines) {
          if (line.startsWith('+') && !line.startsWith('+++')) totalAdded++;
          if (line.startsWith('-') && !line.startsWith('---')) totalRemoved++;
          if (line.startsWith('+') && !line.startsWith('+++') || line.startsWith('-') && !line.startsWith('---')) changedFiles++;
        }
      }
    });

    return {
      addition: totalAdded,
      deletions: totalRemoved,
      total: totalAdded + totalRemoved,
      changedFiles,
    }
  } catch (error: any) {
    console.error('Error fetching merge request changes:', error.message);
    return null;
  }
}

const fethPushStats = async (repositoryId: string, before: string, after: string): Promise<MergeRequestStats | null> => {
  try {
    const response: any = await getCompare(repositoryId, before, after);

    const changes = before == INITIAL_COMMIT_HASH ? response : response.diffs;

    let totalAdded = 0;
    let totalRemoved = 0;
    let changedFiles = 0;

    changes.forEach((change: any) => {
      const diff = change.diff;
      const fileName = change.new_path;
      const lines = diff.split('\n');
      const containsLock = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(fileName);

      if (!containsLock) {
        for (const line of lines) {
          if (line.startsWith('+') && !line.startsWith('+++')) totalAdded++;
          if (line.startsWith('-') && !line.startsWith('---')) totalRemoved++;
          if (line.startsWith('+') && !line.startsWith('+++') || line.startsWith('-') && !line.startsWith('---')) changedFiles++;
        }
      }
    });

    return {
      addition: totalAdded,
      deletions: totalRemoved,
      total: totalAdded + totalRemoved,
      changedFiles,
    }
  } catch (error: any) {
    console.error('Error fetching push changes:', error.message);
    return null;
  }
}

const getCompare = async (repositoryId: string, fromHash: string, toHash: string): Promise<any> => {
  let url = `${GITLAB_API_URL}/projects/${repositoryId}/repository/compare`;

  if (fromHash == INITIAL_COMMIT_HASH)
    url = `${GITLAB_API_URL}/projects/${repositoryId}/repository/commits/${toHash}/diff`;

  try {
    const response = await axios.get(url, {
      headers: {
        'PRIVATE-TOKEN': PRIVATE_TOKEN
      },
      params: {
        from: fromHash,
        to: toHash
      }
    });

    return response.data;

  } catch (error: any) {
    console.error('Error fetching merge request changes:', error.message);
    return null;
  }
}

const getMergeRequest = async (repositoryId: string, mrIid: string): Promise<any> => {
  const url = `${GITLAB_API_URL}/projects/${repositoryId}/merge_requests/${mrIid}/changes`;

  try {
    const response = await axios.get(url, {
      headers: {
        'PRIVATE-TOKEN': PRIVATE_TOKEN
      }
    });

    return response.data;

  } catch (error: any) {
    console.error('Error fetching merge request changes:', error.message);
    return null;
  }
}

export const GitlabWeebhook = (request: any) => {

  const payload = request.body;
  const params = request.query;
  const prisma = new PrismaClient();
  const eventType = payload.event_type ?? payload.event_name;
  let repositoryId = payload.project.id;
  let mrStats: MergeRequestStats | null = null;
  let mrId: any = null;
  const ignoredPrefixes = IGNORE_BRANCHES;

  async function save() {
    try {

      const branchName = getBranchName();

      if (branchName && ignoredPrefixes.some(prefix => branchName.startsWith(prefix))) {
        console.error('Branch ignored.');
        return false;
      }

      if (eventType == GitlabWeebhookEventType.MERGE_REQUEST) {
        mrId = payload?.object_attributes?.iid;
      } else if (eventType == GitlabWeebhookEventType.PUSH) {
        // Get the merge request id
        mrId = await getMrID(repositoryId, branchName);
      } else if (eventType == GitlabWeebhookEventType.NOTE) {
        mrId = payload?.merge_request?.iid;
      }

      if (eventType != GitlabWeebhookEventType.PUSH && mrId) {
        // Get MR Stats
        mrStats = await fetchMRStats(repositoryId, mrId)
      } else if (!mrId && eventType == GitlabWeebhookEventType.PUSH && payload.before && payload.after) {
        // Get Push Stats and only when the push is not related to merge request
        mrStats = await fethPushStats(repositoryId, payload.before, payload.after);
      } else {
        console.error('Could not fetch stats.');
        return false;
      }


      if (eventType == GitlabWeebhookEventType.MERGE_REQUEST || eventType == GitlabWeebhookEventType.PUSH) {
        // PROJECTS, USER, TICKET WILL BE CREATED ONLY DURING OPENING MERGE REQUEST
        const project = await storeProject();
        const user = await storeUser();
        const ticket = await storeTicket(project);

        if (ticket && project && user && mrStats) {
          if (eventType == GitlabWeebhookEventType.PUSH) {
            // Store event without MR
            await storeEvent(
              null,
              user,
              ticket,
              project,
              branchName,
              mrStats,
              WebhookDatabaseEventType.PUSHED,
              null,
              true
            );
          }
          else if (payload?.object_attributes?.action == 'open') {
            await storeEvent(
              mrId,
              user,
              ticket,
              project,
              branchName,
              mrStats,
              WebhookDatabaseEventType.OPENED
            );
          } else if (payload?.object_attributes?.action == 'merge') {
            await storeEvent(
              mrId,
              user,
              ticket,
              project,
              branchName,
              mrStats,
              WebhookDatabaseEventType.MERGED,
              null,
              true
            );
          } else if (['close', 'reopen'].includes(payload?.object_attributes?.action)) {
            const reviewerId = await getReviewerId(payload?.user?.username);
            const action = payload?.object_attributes.action == 'close' ?
              WebhookDatabaseEventType.DISMISSED :
              WebhookDatabaseEventType.REOPEN;

            await storeEvent(
              mrId,
              user,
              ticket,
              project,
              branchName,
              mrStats,
              action,
              reviewerId,
              true // Always create
            );

          } else if (['approved', 'unapproved'].includes(payload?.object_attributes?.action)) {

            const { authorUser } = await resolveMergeRequest(repositoryId, mrId);
            const reviewerId = await getReviewerId(payload?.user?.username);
            const action = payload?.object_attributes.action == 'approved' ?
              WebhookDatabaseEventType.APPROVED :
              WebhookDatabaseEventType.UNAPPROVED;

            if (authorUser) {
              await storeEvent(
                mrId,
                authorUser,
                ticket,
                project,
                branchName,
                mrStats,
                action,
                reviewerId,
                true // Always create
              );
            }

          } else if (payload?.object_attributes.action == 'update') {

            // Get Merge request to validate revisions
            const mergeRequest: any = await getMergeRequest(repositoryId, mrId);
            const reviewer = mergeRequest && mergeRequest.reviewers.length !== 0 ? mergeRequest.reviewers[0].username : null;
            const reviewerId = reviewer ? await getReviewerId(reviewer) : null;

            const mergeRequestEvent = await storeEvent(
              mrId,
              user,
              ticket,
              project,
              branchName,
              mrStats,
              WebhookDatabaseEventType.PUSHED,
              reviewerId,
              true
            );

            // Validate and store revision
            // When a commit has been pushed with an active change request it should record a new revision
            // Should not record to revisions table if no reviewer assigned
            if (reviewerId && mergeRequest && !mergeRequest.blocking_discussions_resolved) {
              await prisma.revision.create({
                data: {
                  pr_event_id: mergeRequestEvent.id,
                  reviewer_id: reviewerId ?? 0
                },
              });
            }
          }
        }

        return true;
      } else if (eventType == GitlabWeebhookEventType.NOTE) {
        const { authorUser } = await resolveMergeRequest(repositoryId, payload?.merge_request?.iid);
        const { project, ticket } = await resolveEntities();
        if (mrStats && ticket && project && authorUser && isChangeRequest()) {
          const reviewerId = await getReviewerId(payload?.user?.username);
          await storeEvent(
            mrId,
            authorUser,
            ticket,
            project,
            branchName,
            mrStats,
            WebhookDatabaseEventType.CHANGES_REQUESTED,
            reviewerId,
            true
          )
        }
        return true;
      }

      console.error('WebhookEvent: Nothing saved');
      return false;
    } catch (error: any) {
      throw error;
      return false;
    }
  }

  async function storeProject() {
    const resolvedByBranch = isProjectFromBranchName();
    const repositoryFullname = getRepositoryFullName();
    let repositoryName = getRepositoryName();
    let condition: { repository?: string, name?: string } = {
      repository: repositoryFullname
    };

    if (resolvedByBranch) {
      repositoryName = getTargetBranch();
      condition = {
        repository: repositoryFullname,
        name: repositoryName,
      };
    }

    // Find or create project
    const existingProject = await prisma.project.findFirst({
      where: condition,
    });

    if (existingProject)
      return existingProject;

    return await prisma.project.create({
      data: {
        name: repositoryName,
        repository: repositoryFullname,
      },
    });
  }

  async function storeTicket(project: Project) {
    const ticketCode = getTicketName();

    let ticket = null;
    if (ticketCode) {
      ticket = await prisma.ticket.upsert({
        where: { code: ticketCode },
        update: {},
        create: { code: ticketCode, project_id: project.id },
      });
    }

    return ticket;
  }

  async function storeUser() {
    const username = getUsername();
    // Find or create the user
    return await prisma.user.upsert({
      where: { username },
      update: {},
      create: { username },
    });
  }

  async function storeEvent(
    mergeRequestId: any,
    user: User,
    ticket: Ticket,
    project: Project,
    branch: string,
    mrStats: MergeRequestStats,
    eventType: any,
    reviewerId: any = null,
    createAlways: boolean = false) {

    // Check for existing pull request from same author/project/ticket
    let mergeRequest = createAlways ? null : await prisma.event.findFirst({
      where: {
        author_id: user.id,
        project_id: project.id,
        ticket_id: ticket?.id ?? undefined,
        pr_number: mergeRequestId,
      },
    });


    if (!mergeRequest) {
      mergeRequest = await prisma.event.create({
        data: {
          project_id: project.id,
          author_id: user.id,
          ticket_id: ticket?.id ?? null,
          branch,
          reviewer_id: reviewerId,
          pr_number: mergeRequestId,
          additions: mrStats.addition,
          deletions: mrStats.deletions,
          changed_files: mrStats.changedFiles,
          source: GITLAB_SOURCE,
          event_type: eventType,
          date_created: new Date(),
          payload: {
            create: {
              raw_payload: payload,
            }
          }
        },
      });
    }

    return mergeRequest;
  }
  

  function getBranchName() {
    let branch = null;

    // Check for possible branch sources
    if (payload.object_attributes) {
      branch = payload.object_attributes.source_branch;
    }

    // Available during push action
    if (!branch && payload.ref) {
      branch = payload?.ref?.replace('refs/heads/', '');
    }

    // Available during note action
    if (!branch && payload?.merge_request) {
      branch = payload?.merge_request.source_branch;
    }

    return branch;
  }

  function getTargetBranch() {
    let branch = null;

    // Available during note action
    if (!branch && payload?.merge_request) {
      branch = payload?.merge_request.target_branch;
    }

    // Check for possible branch sources
    if (payload.object_attributes) {
      branch = payload.object_attributes.target_branch;
    }

    // Available during push action
    if (!branch && payload.ref) {
      branch = payload?.ref?.replace('refs/heads/', '');
    }

    return branch;
  }

  function branchesResolvedAsProjects(): Array<string> {
    return params['branch-projects'] ?? [];
  }

  function isProjectFromBranchName() {
    const branchName = getTargetBranch();
    return branchName ? branchesResolvedAsProjects().includes(branchName) : false;
  }

  async function getReviewerId(username: any) {
    console.log(username);
    const reviewer = await prisma.user.findUnique({
      where: { username },
    });
    return reviewer ? reviewer.id : null;
  }

  function isChangeRequest() {
    return payload?.object_attributes?.type == 'DiffNote';
  }

  function getUsername() {
    return payload?.user ? payload?.user?.username : payload?.user_username;
  }

  function getRepositoryName() {
    return payload?.repository?.name;
  }

  function getRepositoryFullName() {
    return payload?.project?.path_with_namespace ?? payload?.repository?.name;
  }

  function getTicketName() {
    let branch = null;

    if (payload.object_attributes) {
      // Available during merge request action
      branch = payload.object_attributes.source_branch;
    }
    if (!branch && payload.ref) {
      // Available during push action
      branch = payload?.ref?.replace('refs/heads/', '');
    }

    if (!branch && payload?.merge_request) {
      // Available during note action
      branch = payload?.merge_request.source_branch;
    }

    const match = branch.match(/([A-Z]+-\d+)/i);

    if (match) {
      return match[1];
    }

    return branch;
  }

  async function resolveMergeRequest(projectId: any, mergeRequestId: any): Promise<{ authorUser: User | null, mergeRequest: any }> {
    const mergeRequest = await getMergeRequest(projectId, mergeRequestId);
    const authorUser = await prisma.user.findUnique({
      where: { username: mergeRequest?.author?.username },
    });

    return {
      authorUser,
      mergeRequest,
    }
  }

  async function resolveEntities(): Promise<{
    user: User;
    project: Project;
    ticket: Ticket | null;
  }> {

    const username = getUsername();
    const ticketCode = getTicketName();
    const repositoryName = getRepositoryFullName();
    const resolvedProjectByBranch = isProjectFromBranchName();
    let condition: any = { repository: repositoryName };

    if (resolvedProjectByBranch) {
      condition = { repository: repositoryName, name: getTargetBranch() };
    }

    const project = await prisma.project.findFirst(condition);

    if (!project) throw new Error("Project not found");

    const user = await prisma.user.upsert({
      where: { username },
      update: {},
      create: { username },
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

  return {
    save,
  }
}
