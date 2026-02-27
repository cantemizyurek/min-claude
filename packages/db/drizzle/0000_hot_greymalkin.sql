CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
