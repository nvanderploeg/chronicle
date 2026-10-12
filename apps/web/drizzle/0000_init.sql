CREATE TABLE `events` (
	`seq` serial AUTO_INCREMENT NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`task_id` varchar(36),
	`path` varchar(512) CHARACTER SET ascii COLLATE ascii_bin,
	`type` varchar(16) NOT NULL,
	`payload` json NOT NULL,
	`at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `events_seq` PRIMARY KEY(`seq`)
);
--> statement-breakpoint
CREATE TABLE `nodes` (
	`task_id` varchar(36) NOT NULL,
	`path` varchar(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`parent_path` varchar(512) CHARACTER SET ascii COLLATE ascii_bin,
	`key` varchar(64) NOT NULL,
	`depth` int NOT NULL,
	`title` text NOT NULL,
	`state` varchar(32) NOT NULL,
	`note` text NOT NULL,
	`tags` json NOT NULL,
	`position` int NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`state_since` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `nodes_task_id_path_pk` PRIMARY KEY(`task_id`,`path`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`write_key_hash` char(64) NOT NULL,
	`config` json NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`last_write_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`state` varchar(32) NOT NULL,
	`note` text NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`state_since` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`finished_at` timestamp(3),
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `events` ADD CONSTRAINT `events_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `nodes` ADD CONSTRAINT `nodes_task_id_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `events_project_seq_idx` ON `events` (`project_id`,`seq`);--> statement-breakpoint
CREATE INDEX `tasks_project_created_idx` ON `tasks` (`project_id`,`created_at`);