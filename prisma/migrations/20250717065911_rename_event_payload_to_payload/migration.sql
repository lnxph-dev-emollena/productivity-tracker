/*
  Warnings:

  - You are about to drop the `EventPayload` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `EventPayload` DROP FOREIGN KEY `EventPayload_event_id_fkey`;

-- DropTable
DROP TABLE `EventPayload`;

-- CreateTable
CREATE TABLE `Payload` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `raw_payload` JSON NOT NULL,
    `event_id` INTEGER NOT NULL,

    UNIQUE INDEX `Payload_event_id_key`(`event_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Payload` ADD CONSTRAINT `Payload_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
