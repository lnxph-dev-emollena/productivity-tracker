import { NextFunction, Request, RequestHandler, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { getChangedFilesDetails, resolveEntities } from "./helper";
import { EventType } from '@prisma/client';


const prisma = new PrismaClient();
const SOURCE = "github";

export const GithubWebhook = async (req: Request, res: Response) => {
  const event = req.headers["x-github-event"];
  const payload = req.body;



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
    const project = await prisma.project.upsert({
      where: { repository: repo.full_name },
      update: {},
      create: {
        name: repo.name,
        repository: repo.full_name,
      },
    });

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
        create: { code: ticketCode, projectId: project.id },
      });
    }

    // 4. Check for existing pull request from same author/project/ticket
    const existingPR = await prisma.pullRequestEvent.findFirst({
      where: {
        authorId: user.id,
        projectId: project.id,
        ticketId: ticket?.id ?? undefined,
        prNumber,
      },
    });

    if (existingPR) {
      console.log("Duplicate PR. Skipping save.");
      res.status(200).send("Duplicate PR. Skipped.");
      return;
    }

    // 5. Save the new PR
    await prisma.pullRequestEvent.create({
      data: {
        projectId: project.id,
        authorId: user.id,
        ticketId: ticket?.id ?? null,
        branch,
        prNumber,
        additions,
        deletions,
        changedFiles,
        source: SOURCE,
        eventType: EventType.opened,
        eventTimestamp: new Date(),
        payload: {
          create: {
            rawPayload: payload,
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

    await prisma.pullRequestEvent.create({
      data: {
        branch,
        prNumber,
        source: SOURCE,
        projectId: project.id,
        additions,
        deletions,
        changedFiles,
        reviewerId: reviewer.id,
        authorId: user.id,
        ticketId: ticket?.id ?? null,
        eventType: EventType.changes_requested,
        eventTimestamp: new Date(),
        payload: {
          create: {
            rawPayload: payload,
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

    await prisma.pullRequestEvent.create({
      data: {
        branch,
        prNumber,
        source: SOURCE,
        additions,
        deletions,
        changedFiles,
        projectId: project.id,
        authorId: user.id,
        ticketId: ticket?.id ?? null,
        eventType: EventType.dismissed,
        eventTimestamp: new Date(),
        payload: {
          create: {
            rawPayload: payload,
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


    const lastEvent = await prisma.pullRequestEvent.findFirst({
      where: {
        projectId: project.id,
        ticketId: ticket?.id,
      },
      orderBy: { eventTimestamp: "desc" },
    });

    const event = await prisma.pullRequestEvent.create({
      data: {
        branch,
        prNumber,
        source: SOURCE,
        projectId: project.id,
        authorId: user.id,
        ticketId: ticket?.id ?? null,
        eventType: EventType.pushed,
        eventTimestamp: new Date(),
        additions,
        deletions,
        changedFiles,
        payload: {
          create: {
            rawPayload: payload,
          }
        }
      },
    });



    const isValidRevision = lastEvent?.eventType === "changes_requested"

    if (isValidRevision && lastEvent.reviewerId) {
      await prisma.revision.create({
        data: {
          prEventId: event.id,
          reviewerId: lastEvent.reviewerId,
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

    await prisma.pullRequestEvent.create({
      data: {
        branch,
        prNumber,
        source: SOURCE,
        projectId: project.id,
        additions,
        deletions,
        changedFiles,
        authorId: user.id,
        ticketId: ticket?.id ?? null,
        reviewerId: reviewer.id,
        eventType: EventType.approved,
        eventTimestamp: new Date(),
        payload: {
          create: {
            rawPayload: payload,
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

    await prisma.pullRequestEvent.create({
      data: {
        branch,
        prNumber,
        source: SOURCE,
        projectId: project.id,
        authorId: user.id,
        ticketId: ticket?.id ?? null,
        additions,
        deletions,
        changedFiles,
        eventType: EventType.merged,
        eventTimestamp: new Date(),
        payload: {
          create: {
            rawPayload: payload,
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

    await prisma.pullRequestEvent.create({
      data: {
        branch,
        prNumber,
        source: SOURCE,
        projectId: project.id,
        additions,
        deletions,
        changedFiles,
        authorId: user.id,
        ticketId: ticket?.id ?? null,
        eventType: EventType.closed,
        eventTimestamp: new Date(),
        payload: {
          create: {
            rawPayload: payload,
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

