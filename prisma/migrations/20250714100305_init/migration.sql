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
CREATE TABLE `Event` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NULL,
    `author_id` INTEGER NULL,
    `reviewer_id` INTEGER NULL,
    `ticket_id` INTEGER NULL,
    `source` ENUM('github', 'gitlab', 'bitbucket') NOT NULL,
    `branch` VARCHAR(191) NULL,
    `prNumber` INTEGER NULL,
    `additions` INTEGER NULL,
    `deletions` INTEGER NULL,
    `changed_files` INTEGER NULL,
    `event_type` ENUM('opened', 'merged', 'closed', 'changes_requested', 'pushed', 'dismissed', 'approved', 'unapproved', 'reopen') NOT NULL,
    `date_created` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Event_project_id_idx`(`project_id`),
    INDEX `Event_author_id_idx`(`author_id`),
    INDEX `Event_ticket_id_idx`(`ticket_id`),
    INDEX `Event_author_id_ticket_id_idx`(`author_id`, `ticket_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventPayload` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rawPayload` JSON NOT NULL,
    `eventId` INTEGER NOT NULL,

    UNIQUE INDEX `EventPayload_eventId_key`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Revision` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pr_event_id` INTEGER NOT NULL,
    `reviewer_id` INTEGER NOT NULL,

    INDEX `Revision_pr_event_id_idx`(`pr_event_id`),
    INDEX `Revision_reviewer_id_idx`(`reviewer_id`),
    UNIQUE INDEX `Revision_pr_event_id_key`(`pr_event_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_reviewer_id_fkey` FOREIGN KEY (`reviewer_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventPayload` ADD CONSTRAINT `EventPayload_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Revision` ADD CONSTRAINT `Revision_pr_event_id_fkey` FOREIGN KEY (`pr_event_id`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Revision` ADD CONSTRAINT `Revision_reviewer_id_fkey` FOREIGN KEY (`reviewer_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
