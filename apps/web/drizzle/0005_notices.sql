CREATE TABLE `notices` (
	`id` varchar(36) NOT NULL,
	`task_id` varchar(36) NOT NULL,
	`path` varchar(512),
	`kind` varchar(16) NOT NULL,
	`text` text NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `notices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `notices` ADD CONSTRAINT `notices_task_id_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `notices_task_created_idx` ON `notices` (`task_id`,`created_at`);