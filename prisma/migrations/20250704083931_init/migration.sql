-- CreateTable
CREATE TABLE `Project` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `repository` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Project_name_key`(`name`),
    UNIQUE INDEX `Project_repository_key`(`repository`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Ticket` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `projectId` INTEGER NOT NULL,

    UNIQUE INDEX `Ticket_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PullRequestEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NULL,
    `authorId` INTEGER NULL,
    `reviewer` VARCHAR(191) NULL,
    `ticketId` INTEGER NULL,
    `source` ENUM('github', 'gitlab', 'bitbucket') NOT NULL,
    `branch` VARCHAR(191) NULL,
    `prNumber` INTEGER NULL,
    `additions` INTEGER NULL,
    `deletions` INTEGER NULL,
    `changedFiles` INTEGER NULL,
    `eventType` ENUM('opened', 'merged', 'closed', 'changes_requested', 'pushed', 'resolved', 'unresolved', 'dismissed', 'approved') NOT NULL,
    `eventTimestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PullRequestEvent_projectId_idx`(`projectId`),
    INDEX `PullRequestEvent_authorId_idx`(`authorId`),
    INDEX `PullRequestEvent_ticketId_idx`(`ticketId`),
    INDEX `PullRequestEvent_authorId_ticketId_idx`(`authorId`, `ticketId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PullRequestPayload` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rawPayload` JSON NOT NULL,
    `eventId` INTEGER NOT NULL,

    UNIQUE INDEX `PullRequestPayload_eventId_key`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Revision` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `prEventId` INTEGER NOT NULL,
    `reviewer` VARCHAR(191) NOT NULL,

    INDEX `Revision_prEventId_idx`(`prEventId`),
    UNIQUE INDEX `Revision_prEventId_key`(`prEventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PullRequestEvent` ADD CONSTRAINT `PullRequestEvent_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PullRequestEvent` ADD CONSTRAINT `PullRequestEvent_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PullRequestEvent` ADD CONSTRAINT `PullRequestEvent_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PullRequestPayload` ADD CONSTRAINT `PullRequestPayload_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `PullRequestEvent`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Revision` ADD CONSTRAINT `Revision_prEventId_fkey` FOREIGN KEY (`prEventId`) REFERENCES `PullRequestEvent`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
