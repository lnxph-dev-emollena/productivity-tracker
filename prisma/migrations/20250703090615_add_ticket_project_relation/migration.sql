-- Step 1: Add the column as nullable
ALTER TABLE `Ticket` ADD COLUMN `projectId` INT;

-- Step 2: Backfill existing ticket.projectId from related PR events
UPDATE `Ticket` t
JOIN `PullRequestEvent` e ON t.id = e.ticketId
SET t.projectId = e.projectId
WHERE t.projectId IS NULL AND e.projectId IS NOT NULL;

-- Step 3: Make the column required
ALTER TABLE `Ticket` MODIFY COLUMN `projectId` INT NOT NULL;

-- Step 4: Add foreign key constraint
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`);
