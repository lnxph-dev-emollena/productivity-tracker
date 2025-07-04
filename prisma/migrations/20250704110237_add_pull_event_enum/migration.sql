-- AlterTable
ALTER TABLE `PullRequestEvent` MODIFY `eventType` ENUM('opened', 'merged', 'closed', 'changes_requested', 'pushed', 'resolved', 'unresolved', 'dismissed', 'approved', 'unapproved', 'reopen') NOT NULL;
