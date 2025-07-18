import { NextFunction, Request, RequestHandler, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { fetchPushCommitStats, getChangedFilesDetails, resolveEntities } from "./helper";
import { EventType } from '@prisma/client';


const prisma = new PrismaClient();
const SOURCE = "github";

export const GithubWebhook = async (req: Request, res: Response) => {
  const event = req.headers["x-github-event"];
  const payload = req.body;


  if (event === 'push') {
    if (payload.head_commit.committer.name === "GitHub") {

      res.status(200).send("Invalid push event from GitHub");
      return;
    }

    const repo = payload.repository;
    const username = payload.pusher?.name;

    let project = await prisma.project.findFirst({
      where: { repository: repo.full_name },
    });

    if(!project) {
      project = await prisma.project.create({
        data: {
          name: repo.name,
          repository: repo.full_name,
        },
      });
    }

    const user = await prisma.user.upsert({
      where: { username },
      update: {},
      create: { username },
    });

    try {
      const stats = await fetchPushCommitStats(payload);

      const { totalAdditions, totalDeletions } = stats;
      const changedFiles: number = payload.head_commit?.added?.length + payload.head_commit?.removed?.length + payload.head_commit?.modified?.length;


      await prisma.event.create({
        data: {
          branch: payload.ref?.replace('refs/heads/', ''),
          source: SOURCE,
          project_id: project.id,
          author_id: user.id,
          additions: totalAdditions,
          deletions: totalDeletions,
          changed_files: changedFiles,
          event_type: EventType.pushed,
          date_created: new Date(),
          payload: {
            create: {
              raw_payload: payload,
            }
          }
        },
      });

      res.status(200).send("Push event processed successfully.");
      return
    } catch (error) {
      console.error("Error processing push event:", error);
      res.status(500).json({ error: "Failed to process push event." });
      return
    }
  }

  if (
    !["pull_request", "pull_request_review", "pull_request_review_thread"].includes(event as string)
  ) {
    res.status(200).send("Event ignored");
    return;
  }

  const branch = payload.pull_request?.head?.ref;

  const ignoredPrefixes = ["dev", "develop", "staging", "main", "prod", "production"];

  if (branch && ignoredPrefixes.some(prefix => branch.startsWith(prefix))) {
    res.status(200).send("Branch ignored");
    return;
  }

  const action = payload.action;

  switch (true) {
    case action === "opened":
      return handleOpenedEvent(payload, res);

    case action === "submitted" && payload.review.state === "changes_requested":
      return handleChangesRequested(payload, res);

    case action === "dismissed":
      return handleDismissed(payload, res);

    case action === "synchronize":
      return handlePushed(payload, res);

    case action === "submitted" && payload.review.state === "approved":
      return handleApproved(payload, res);

    case action === "closed" && payload.pull_request.merged:
      return handleMerged(payload, res);

    case action === "closed" && !payload.pull_request.merged:
      return handleClosed(payload, res);

    default:
      return res.status(200).send("Unhandled action");
  }
};

const handleOpenedEvent = async (payload: any, res: Response) => {

  try {
    const pr = payload.pull_request;
    const repo = payload.repository;

    const { additions, deletions, changedFiles } = await getChangedFilesDetails(
      repo.full_name,
      pr.number,
    );

    const branch = pr.head.ref || "unknown";
    const username = pr.user.login;
    const prNumber = pr.number;

    let ticketCode: string | null = null;
    const parts = branch.split("/");

    if (parts.length > 1) {
      const subParts = parts[1].split("-");
      if (subParts.length >= 2) {
        ticketCode = `${subParts[0]}-${subParts[1]}`;
      } else if (subParts.length === 1) {
        ticketCode = subParts[0];
      }
    }

    // 1. Find or create the project
    let project = await prisma.project.findFirst({
      where: { repository: repo.full_name },
    });

    if(!project) {
      project = await prisma.project.create({
        data: {
          name: repo.name,
          repository: repo.full_name,
        },
      });
    }

    // 2. Find or create the user
    const user = await prisma.user.upsert({
      where: { username },
      update: {},
      create: { username },
    });

    // 3. Find or create the ticket (optional)
    let ticket = null;
    if (ticketCode) {
      ticket = await prisma.ticket.upsert({
        where: { code: ticketCode },
        update: {},
        create: { code: ticketCode, project_id: project.id },
      });
    }

    // 4. Check for existing pull request from same author/project/ticket
    const existingPR = await prisma.event.findFirst({
      where: {
        author_id: user.id,
        project_id: project.id,
        ticket_id: ticket?.id ?? undefined,
        pr_number: prNumber,
      },
    });

    if (existingPR) {
      console.log("Duplicate PR. Skipping save.");
      res.status(200).send("Duplicate PR. Skipped.");
      return;
    }

    // 5. Save the new PR
    await prisma.event.create({
      data: {
        project_id: project.id,
        author_id: user.id,
        ticket_id: ticket?.id ?? null,
        branch,
        pr_number: prNumber,
        additions,
        deletions,
        changed_files: changedFiles,
        source: SOURCE,
        event_type: EventType.opened,
        date_created: new Date(),
        payload: {
          create: {
            raw_payload: payload,
          }
        }
      },
    });

    console.log("PR saved:", {
      user: username,
      branch,
      ticket: ticketCode,
    });

    res.status(200).send("Pull request opened event recorded.");
    return;
  } catch (error) {
    console.error("Error saving PR opened event:", error);
    res.status(500).json({ error: "Failed to save pull request opened event." });
    return;
  }
};

const handleChangesRequested = async (payload: any, res: Response) => {

  try {
    const pr = payload.pull_request;
    const repo = payload.repository;

    const { additions, deletions, changedFiles } = await getChangedFilesDetails(
      repo.full_name,
      pr.number,
    );

    const review = payload.review;

    const reviewer = await prisma.user.upsert({
      where: { username: review.user.login },
      update: {},
      create: { username: review.user.login },
    });

    const {
      project,
      user,
      ticket,
    } = await resolveEntities(prisma, pr, repo);

    const branch = pr.head.ref || "unknown";
    const prNumber = pr.number;

    await prisma.event.create({
      data: {
        branch,
        pr_number: prNumber,
        source: SOURCE,
        project_id: project.id,
        additions,
        deletions,
        changed_files: changedFiles,
        reviewer_id: reviewer.id,
        author_id: user.id,
        ticket_id: ticket?.id ?? null,
        event_type: EventType.changes_requested,
        date_created: new Date(),
        payload: {
          create: {
            raw_payload: payload,
          }
        }
      },
    });

    res.status(200).send("Pull request change requested event recorded.");
  } catch (error) {
    console.error("Error saving PR change requested event:", error);
    res.status(500).json({ error: "Failed to save pull request change requested event." });
  }
}

const handleDismissed = async (payload: any, res: Response) => {

  try {
    const pr = payload.pull_request;
    const repo = payload.repository;

    const { additions, deletions, changedFiles } = await getChangedFilesDetails(
      repo.full_name,
      pr.number,
    );

    const {
      project,
      user,
      ticket,
    } = await resolveEntities(prisma, pr, repo);

    const branch = pr.head.ref || "unknown";
    const prNumber = pr.number;

    await prisma.event.create({
      data: {
        branch,
        pr_number: prNumber,
        source: SOURCE,
        additions,
        deletions,
        changed_files: changedFiles,
        project_id: project.id,
        author_id: user.id,
        ticket_id: ticket?.id ?? null,
        event_type: EventType.dismissed,
        date_created: new Date(),
        payload: {
          create: {
            raw_payload: payload,
          }
        }
      },
    });

    res.status(200).send("Pull request dismissed event recorded.");
  } catch (error) {
    console.error("Error saving PR dismissed event:", error);
    res.status(500).json({ error: "Failed to save pull request dismissed event." });
  }
}

const handlePushed = async (payload: any, res: Response) => {

  try {
    const pr = payload.pull_request;
    const repo = payload.repository;
    const { additions, deletions, changedFiles } = await getChangedFilesDetails(
      repo.full_name,
      pr.number,
    );

    const {
      project,
      user,
      ticket,
    } = await resolveEntities(prisma, pr, repo);

    const branch = pr.head.ref || "unknown";
    const prNumber = pr.number;


    const lastEvent = await prisma.event.findFirst({
      where: {
        project_id: project.id,
        ticket_id: ticket?.id,
      },
      orderBy: { date_created: "desc" },
    });

    const event = await prisma.event.create({
      data: {
        branch,
        pr_number: prNumber,
        source: SOURCE,
        project_id: project.id,
        author_id: user.id,
        ticket_id: ticket?.id ?? null,
        event_type: EventType.pushed,
        date_created: new Date(),
        additions,
        deletions,
        changed_files: changedFiles,
        payload: {
          create: {
            raw_payload: payload,
          }
        }
      },
    });



    const isValidRevision = lastEvent?.event_type === "changes_requested"

    if (isValidRevision && lastEvent.reviewer_id) {
      await prisma.revision.create({
        data: {
          pr_event_id: event.id,
          reviewer_id: lastEvent.reviewer_id,
        },
      });
    }

    res.status(200).send("Pull request pushed event recorded.");
  } catch (error) {
    console.error("Error saving PR pushed event:", error);
    res.status(500).json({ error: "Failed to save pull request pushed event." });
  }
}

const handleApproved = async (payload: any, res: Response) => {

  try {
    const pr = payload.pull_request;
    const repo = payload.repository;
    const review = payload.review;

    const { additions, deletions, changedFiles } = await getChangedFilesDetails(
      repo.full_name,
      pr.number,
    );

    const reviewer = await prisma.user.upsert({
      where: { username: review.user.login },
      update: {},
      create: { username: review.user.login },
    });

    const {
      project,
      user,
      ticket,
    } = await resolveEntities(prisma, pr, repo);

    const branch = pr.head.ref || "unknown";
    const prNumber = pr.number;

    await prisma.event.create({
      data: {
        branch,
        pr_number: prNumber,
        source: SOURCE,
        project_id: project.id,
        additions,
        deletions,
        changed_files: changedFiles,
        author_id: user.id,
        ticket_id: ticket?.id ?? null,
        reviewer_id: reviewer.id,
        event_type: EventType.approved,
        date_created: new Date(),
        payload: {
          create: {
            raw_payload: payload,
          }
        }
      },
    });

    res.status(200).send("Pull request approved event recorded.");
  } catch (error) {
    console.error("Error saving PR approved event:", error);
    res.status(500).json({ error: "Failed to save pull request approved event." });
  }
}

const handleMerged = async (payload: any, res: Response) => {

  try {
    const pr = payload.pull_request;
    const repo = payload.repository;
    const { additions, deletions, changedFiles } = await getChangedFilesDetails(
      repo.full_name,
      pr.number,
    );

    const {
      project,
      user,
      ticket,
    } = await resolveEntities(prisma, pr, repo);

    const branch = pr.head.ref || "unknown";
    const prNumber = pr.number;

    await prisma.event.create({
      data: {
        branch,
        pr_number: prNumber,
        source: SOURCE,
        project_id: project.id,
        author_id: user.id,
        ticket_id: ticket?.id ?? null,
        additions,
        deletions,
        changed_files: changedFiles,
        event_type: EventType.merged,
        date_created: new Date(),
        payload: {
          create: {
            raw_payload: payload,
          }
        }
      },
    });

    res.status(200).send("Pull request merged event recorded.");
  } catch (error) {
    console.error("Error saving PR merged event:", error);
    res.status(500).json({ error: "Failed to save pull request merged event." });
  }
}

const handleClosed = async (payload: any, res: Response) => {

  try {
    const pr = payload.pull_request;
    const repo = payload.repository;

    const { additions, deletions, changedFiles } = await getChangedFilesDetails(
      repo.full_name,
      pr.number,
    );

    const {
      project,
      user,
      ticket,
    } = await resolveEntities(prisma, pr, repo);

    const branch = pr.head.ref || "unknown";
    const prNumber = pr.number;

    await prisma.event.create({
      data: {
        branch,
        pr_number: prNumber,
        source: SOURCE,
        project_id: project.id,
        additions,
        deletions,
        changed_files: changedFiles,
        author_id: user.id,
        ticket_id: ticket?.id ?? null,
        event_type: EventType.closed,
        date_created: new Date(),
        payload: {
          create: {
            raw_payload: payload,
          }
        }
      },
    });

    res.status(200).send("Pull request closed event recorded.");
  } catch (error) {
    console.error("Error saving PR closed event:", error);
    res.status(500).json({ error: "Failed to save pull request closed event." });
  }
}

