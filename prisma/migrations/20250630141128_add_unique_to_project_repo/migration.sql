/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `Project` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[repository]` on the table `Project` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Project_name_key` ON `Project`(`name`);

-- CreateIndex
CREATE UNIQUE INDEX `Project_repository_key` ON `Project`(`repository`);
