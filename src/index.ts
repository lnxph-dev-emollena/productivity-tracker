import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

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

  console.log('event', event);
  console.log('payload', payload);

  if (event === "pull_request" && payload.action === "opened") {
    console.log('this fired');
    try {
      const pr = payload.pull_request;
      const repo = payload.repository;

      const branch = pr.head.ref || "unknown";
      const createdAt = new Date(pr.created_at);
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
      const existingPR = await prisma.pullRequest.findFirst({
        where: {
          authorId: user.id,
          projectId: project.id,
          ticketId: ticket?.id ?? undefined,
          prNumber,
        },
      });

      if (existingPR) {
        console.log("⚠️ Duplicate PR. Skipping save.");
        res.status(200).send("Duplicate PR. Skipped.");
        return;
      }

      // 5. Save the new PR
      await prisma.pullRequest.create({
        data: {
          projectId: project.id,
          authorId: user.id,
          ticketId: ticket?.id ?? null,
          branch,
          createdAt,
          prNumber,
          additions,
          deletions,
          changedFiles,
        },
      });

      console.log("PR saved:", {
        user: username,
        branch,
        ticket: ticketCode,
      });

      res.status(200).send("Pull request recorded.");
      return;
    } catch (error) {
      console.error("Error saving PR:", error);
      res.status(500).json({ error: "Failed to save pull request" });
      return;
    }
  }


});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});