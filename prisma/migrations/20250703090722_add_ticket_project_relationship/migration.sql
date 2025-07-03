-- DropForeignKey
ALTER TABLE `Ticket` DROP FOREIGN KEY `Ticket_projectId_fkey`;

-- DropIndex
DROP INDEX `Ticket_projectId_fkey` ON `Ticket`;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
