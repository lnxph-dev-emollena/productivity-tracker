import express, { Request, RequestHandler, Response } from "express";
import { GitlabWeebhook } from "./lib/gitlab-webhook";
import { GithubWebhook } from "./lib/github-webhook";


const app = express();
const port = process.env.PORT || 8000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req: Request, res: Response) => {
  res.send("Workflow Insight API is running!");
});


app.post("/webhook/gitlab", async (req: Request, res: Response) => {

  const webhook = GitlabWeebhook(req.body);

  const isSuccess = await webhook.save();

  if(!isSuccess) res.status(200).send("Unable to process the event — it may have been intentionally ignored or an error occurred.");

  console.log("Event Processed: Pull request opened event recorded.");
  
  res.status(200).send("Pull request opened event recorded.");

  return;

});

app.post("/webhook", GithubWebhook as RequestHandler);


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});