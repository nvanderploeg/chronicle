ALTER TABLE `nodes` ADD `agent` json;--> statement-breakpoint
ALTER TABLE `nodes` ADD `links` json;--> statement-breakpoint
ALTER TABLE `projects` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `links` json;--> statement-breakpoint
ALTER TABLE `tasks` ADD `agent` json;--> statement-breakpoint
ALTER TABLE `tasks` ADD `links` json;--> statement-breakpoint
ALTER TABLE `tasks` ADD `repo` varchar(255);--> statement-breakpoint
ALTER TABLE `tasks` ADD `branch` varchar(255);