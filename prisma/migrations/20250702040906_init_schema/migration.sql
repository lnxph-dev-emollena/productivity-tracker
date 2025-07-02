/*
  Warnings:

  - You are about to drop the `PullRequest` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `PullRequest` DROP FOREIGN KEY `PullRequest_authorId_fkey`;

-- DropForeignKey
ALTER TABLE `PullRequest` DROP FOREIGN KEY `PullRequest_projectId_fkey`;

-- DropForeignKey
ALTER TABLE `PullRequest` DROP FOREIGN KEY `PullRequest_ticketId_fkey`;

-- DropTable
DROP TABLE `PullRequest`;

-- CreateTable
CREATE TABLE `PullRequestEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NULL,
    `authorId` INTEGER NULL,
    `ticketId` INTEGER NULL,
    `source` ENUM('GitHub', 'GitLab', 'Bitbucket') NOT NULL,
    `branch` VARCHAR(191) NULL,
    `prNumber` INTEGER NULL,
    `additions` INTEGER NULL,
    `deletions` INTEGER NULL,
    `changedFiles` INTEGER NULL,
    `eventType` ENUM('opened', 'merged', 'closed', 'review_requested', 'changes_requested', 'pushed', 'resolved', 'unresolved', 'dismissed', 'approved') NOT NULL,
    `eventTimestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `rawPayload` JSON NULL,

    INDEX `PullRequestEvent_projectId_idx`(`projectId`),
    INDEX `PullRequestEvent_authorId_idx`(`authorId`),
    INDEX `PullRequestEvent_ticketId_idx`(`ticketId`),
    INDEX `PullRequestEvent_authorId_ticketId_idx`(`authorId`, `ticketId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PullRequestEvent` ADD CONSTRAINT `PullRequestEvent_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PullRequestEvent` ADD CONSTRAINT `PullRequestEvent_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PullRequestEvent` ADD CONSTRAINT `PullRequestEvent_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
