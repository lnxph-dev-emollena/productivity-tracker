/*
  Warnings:

  - You are about to drop the column `eventId` on the `EventPayload` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[event_id]` on the table `EventPayload` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `event_id` to the `EventPayload` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `EventPayload` DROP FOREIGN KEY `EventPayload_eventId_fkey`;

-- DropIndex
DROP INDEX `EventPayload_eventId_key` ON `EventPayload`;

-- AlterTable
ALTER TABLE `EventPayload` DROP COLUMN `eventId`,
    ADD COLUMN `event_id` INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `EventPayload_event_id_key` ON `EventPayload`(`event_id`);

-- AddForeignKey
ALTER TABLE `EventPayload` ADD CONSTRAINT `EventPayload_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
