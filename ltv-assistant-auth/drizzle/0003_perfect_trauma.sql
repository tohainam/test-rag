ALTER TABLE `refresh_tokens` ADD `user_agent` text;--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD `ip_address` varchar(45);--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD `last_used_at` timestamp;