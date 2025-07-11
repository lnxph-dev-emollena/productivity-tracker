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

export const GitlabWeebhook = (payload: any) => {

  const prisma = new PrismaClient();
  const eventType = payload.event_type ?? payload.event_name;
  let repositoryId = payload.project.id;
  let mrStats: MergeRequestStats | null = null;
  let mrId: any = null;
  const ignoredPrefixes = ["dev", "develop", "staging", "main", "prod", "production"];

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

      if (!mrId) {
        console.error('Merge Request not found.');
        return false;
      }

      // Get MR Stats
      mrStats = await fetchMRStats(repositoryId, mrId);

      if (eventType == GitlabWeebhookEventType.MERGE_REQUEST) {
        // PROJECTS, USER, TICKET WILL BE CREATED ONLY DURING OPENING MERGE REQUEST
        const project = await storeProject();
        const user = await storeUser();
        const ticket = await storeTicket(project);

        if (ticket && project && user && mrStats) {
          if (payload?.object_attributes.action == 'open') {
            await storeMergeRequestEvent(
              mrId,
              user,
              ticket,
              project,
              branchName,
              mrStats,
              WebhookDatabaseEventType.OPENED
            );
          } else if (payload?.object_attributes.action == 'merge') {
            await storeMergeRequestEvent(
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
          } else if (['close', 'reopen'].includes(payload?.object_attributes.action)) {
            const reviewerId = await getReviewerId(payload?.user?.username);
            const action = payload?.object_attributes.action == 'close' ?
              WebhookDatabaseEventType.DISMISSED :
              WebhookDatabaseEventType.REOPEN;

            await storeMergeRequestEvent(
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

          } else if (['approved', 'unapproved'].includes(payload?.object_attributes.action)) {

            const { authorUser } = await resolveMergeRequest(repositoryId, mrId);
            const reviewerId = await getReviewerId(payload?.user?.username);
            const action = payload?.object_attributes.action == 'approved' ?
              WebhookDatabaseEventType.APPROVED :
              WebhookDatabaseEventType.UNAPPROVED;

            if (authorUser) {
              await storeMergeRequestEvent(
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
            const reviewerId = await getReviewerId(reviewer);

            const mergeRequestEvent = await storeMergeRequestEvent(
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
            if (mergeRequest && !mergeRequest.blocking_discussions_resolved) {
              await prisma.revision.create({
                data: {
                  prEventId: mergeRequestEvent.id,
                  reviewerId: reviewerId ?? 0
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
          await storeMergeRequestEvent(
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
      console.error('Error saving webhook event:', error.message);
      return false;
    }
  }

  async function storeProject() {
    const repositoryName = getRepositoryName();
    const repositoryFullname = getRepositoryFullName();

    // Find or create the project
    return await prisma.project.upsert({
      where: { repository: repositoryFullname },
      update: {},
      create: {
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
        create: { code: ticketCode, projectId: project.id },
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

  async function storeMergeRequestEvent(
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
    let mergeRequest = createAlways ? null : await prisma.pullRequestEvent.findFirst({
      where: {
        authorId: user.id,
        projectId: project.id,
        ticketId: ticket?.id ?? undefined,
        prNumber: mergeRequestId,
      },
    });

    if (!mergeRequest) {
      mergeRequest = await prisma.pullRequestEvent.create({
        data: {
          projectId: project.id,
          authorId: user.id,
          ticketId: ticket?.id ?? null,
          branch,
          reviewerId,
          prNumber: mergeRequestId,
          additions: mrStats.addition,
          deletions: mrStats.deletions,
          changedFiles: mrStats.changedFiles,
          source: GITLAB_SOURCE,
          eventType,
          eventTimestamp: new Date(),
          payload: {
            create: {
              rawPayload: payload,
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

  async function getReviewerId(username: any) {
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
    const repositoryName = getRepositoryName();

    const project = await prisma.project.findUnique({
      where: { repository: repositoryName },
    });

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
