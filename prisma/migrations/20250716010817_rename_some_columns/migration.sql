/*
  Warnings:

  - You are about to drop the column `prNumber` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `rawPayload` on the `EventPayload` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `Ticket` table. All the data in the column will be lost.
  - Added the required column `raw_payload` to the `EventPayload` table without a default value. This is not possible if the table is not empty.
  - Added the required column `project_id` to the `Ticket` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `Ticket` DROP FOREIGN KEY `Ticket_projectId_fkey`;

-- DropIndex
DROP INDEX `Ticket_projectId_fkey` ON `Ticket`;

-- AlterTable
ALTER TABLE `Event` DROP COLUMN `prNumber`,
    ADD COLUMN `pr_number` INTEGER NULL;

-- AlterTable
ALTER TABLE `EventPayload` DROP COLUMN `rawPayload`,
    ADD COLUMN `raw_payload` JSON NOT NULL;

-- AlterTable
ALTER TABLE `Ticket` DROP COLUMN `projectId`,
    ADD COLUMN `project_id` INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
