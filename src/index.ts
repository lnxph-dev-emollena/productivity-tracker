import express, { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { resolveEntities } from "./lib/helper";

const app = express();
const port = process.env.PORT || 8000;
const prisma = new PrismaClient();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req: Request, res: Response) => {
  res.send("Productivity Tracker API is running!");
});

app.post("/webhook", async (req: Request, res: Response) => {
  const event = req.headers["x-github-event"];
  const payload = req.body;
  const source = "github"; // Assuming GitHub for now, can be extended later


  if (event !== "pull_request" && event !== "pull_request_review" && event !== 'pull_request_review_thread') return;

  if (payload.action === "opened") {
    try {
      const pr = payload.pull_request;
      const repo = payload.repository;

      const branch = pr.head.ref || "unknown";
      const username = pr.user.login;
      const additions = pr.additions || 0;
      const deletions = pr.deletions || 0;
      const changedFiles = pr.changed_files || 0;
      const prNumber = pr.number;

      const ticketCodeMatch = branch.match(/([A-Z]+-\d+)/i);
      const ticketCode = ticketCodeMatch ? ticketCodeMatch[1].toUpperCase() : null;

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
          create: { code: ticketCode },
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
          source,
          eventType: "opened",
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
  }

  if (payload.action === "submitted" && payload.review.state === "changes_requested") {


    try {
      const pr = payload.pull_request;
      const repo = payload.repository;

      const {
        project,
        user,
        ticket,
      } = await resolveEntities(prisma, pr, repo);

      const review = payload.review;
      const branch = pr.head.ref || "unknown";
      const reviewer = review.user.login;
      const prNumber = pr.number;

      await prisma.pullRequestEvent.create({
        data: {
          branch,
          prNumber,
          reviewer,
          source,
          projectId: project.id,
          authorId: user.id,
          ticketId: ticket?.id ?? null,
          eventType: "changes_requested",
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

  if (payload.action === "dismissed") {
    try {
      const pr = payload.pull_request;
      const repo = payload.repository;

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
          source,
          projectId: project.id,
          authorId: user.id,
          ticketId: ticket?.id ?? null,
          eventType: "dismissed",
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

  if (payload.action === "synchronize") {
    try {
      const pr = payload.pull_request;
      const repo = payload.repository;

      const {
        project,
        user,
        ticket,
      } = await resolveEntities(prisma, pr, repo);

      const additions = pr.additions || 0;
      const deletions = pr.deletions || 0;
      const changedFiles = pr.changed_files || 0;

      const branch = pr.head.ref || "unknown";
      const prNumber = pr.number;

      await prisma.pullRequestEvent.create({
        data: {
          branch,
          prNumber,
          source,
          projectId: project.id,
          authorId: user.id,
          ticketId: ticket?.id ?? null,
          eventType: "pushed",
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

      res.status(200).send("Pull request pushed event recorded.");
    } catch (error) {
      console.error("Error saving PR pushed event:", error);
      res.status(500).json({ error: "Failed to save pull request pushed event." });
    }
  }

  if (payload.action === "submitted" && payload.review.state === "approved") {
    try {
      const pr = payload.pull_request;
      const repo = payload.repository;

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
          source,
          projectId: project.id,
          authorId: user.id,
          ticketId: ticket?.id ?? null,
          reviewer: payload.sender.login,
          eventType: "approved",
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
  if (payload.action === "closed" && payload.pull_request.merged) {
    try {
      const pr = payload.pull_request;
      const repo = payload.repository;

      const {
        project,
        user,
        ticket,
      } = await resolveEntities(prisma, pr, repo);

      const branch = pr.head.ref || "unknown";
      const prNumber = pr.number;
      const additions = pr.additions || 0;
      const deletions = pr.deletions || 0;
      const changedFiles = pr.changed_files || 0;

      await prisma.pullRequestEvent.create({
        data: {
          branch,
          prNumber,
          source,
          projectId: project.id,
          authorId: user.id,
          ticketId: ticket?.id ?? null,
          additions,
          deletions,
          changedFiles,
          eventType: "merged",
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

  if (payload.action === "resolved") {
    try {
      const pr = payload.pull_request;
      const repo = payload.repository;

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
          source,
          projectId: project.id,
          authorId: user.id,
          ticketId: ticket?.id ?? null,
          eventType: "resolved",
          eventTimestamp: new Date(),
          payload: {
            create: {
              rawPayload: payload,
            }
          }
        },
      });

      res.status(200).send("Pull request resolved event recorded.");
    } catch (error) {
      console.error("Error saving PR resolved event:", error);
      res.status(500).json({ error: "Failed to save pull request resolved event." });
    }
  }

  if (payload.action === "unresolved") {
    try {
      const pr = payload.pull_request;
      const repo = payload.repository;

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
          source,
          reviewer: payload.sender.login,
          projectId: project.id,
          authorId: user.id,
          ticketId: ticket?.id ?? null,
          eventType: "unresolved",
          eventTimestamp: new Date(),
          payload: {
            create: {
              rawPayload: payload,
            }
          }
        },
      });

      res.status(200).send("Pull request unresolved event recorded.");
    } catch (error) {
      console.error("Error saving PR unresolved event:", error);
      res.status(500).json({ error: "Failed to save pull request unresolved event." });
    }
  }

  if (payload.action === "closed" && !payload.pull_request.merged) {
    try {
      const pr = payload.pull_request;
      const repo = payload.repository;

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
          source,
          projectId: project.id,
          authorId: user.id,
          ticketId: ticket?.id ?? null,
          eventType: "closed",
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

});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});