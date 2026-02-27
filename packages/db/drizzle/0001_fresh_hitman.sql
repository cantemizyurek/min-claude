CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prd_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_use_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`prd_id`) REFERENCES `prds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `prds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`title` text NOT NULL,
	`phase` text DEFAULT 'chat' NOT NULL,
	`github_issue_number` integer,
	`claude_session_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
