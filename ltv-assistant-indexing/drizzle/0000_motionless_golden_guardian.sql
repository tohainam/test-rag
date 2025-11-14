CREATE TABLE `child_chunks` (
	`id` varchar(255) NOT NULL,
	`document_id` varchar(255) NOT NULL,
	`parent_chunk_id` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`tokens` int NOT NULL,
	`chunk_index` int NOT NULL,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `child_chunks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chunk_lineage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parent_chunk_id` varchar(255) NOT NULL,
	`child_chunk_id` varchar(255) NOT NULL,
	`child_order` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chunk_lineage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` varchar(255) NOT NULL,
	`file_id` varchar(255) NOT NULL,
	`filename` varchar(1000) NOT NULL,
	`document_type` enum('pdf','docx','text','code','markdown') NOT NULL,
	`status` enum('indexing','indexed','failed') NOT NULL DEFAULT 'indexing',
	`total_parent_chunks` int NOT NULL DEFAULT 0,
	`total_child_chunks` int NOT NULL DEFAULT 0,
	`total_tokens` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`indexed_at` timestamp,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`),
	CONSTRAINT `documents_file_id_unique` UNIQUE(`file_id`)
);
--> statement-breakpoint
CREATE TABLE `indexing_jobs` (
	`id` varchar(36) NOT NULL,
	`file_id` varchar(36) NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`filename` varchar(500) NOT NULL,
	`job_id` varchar(100),
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`error` text,
	`started_at` timestamp,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `indexing_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parent_chunks` (
	`id` varchar(255) NOT NULL,
	`document_id` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`tokens` int NOT NULL,
	`chunk_index` int NOT NULL,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `parent_chunks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `child_chunks` ADD CONSTRAINT `child_chunks_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `child_chunks` ADD CONSTRAINT `child_chunks_parent_chunk_id_parent_chunks_id_fk` FOREIGN KEY (`parent_chunk_id`) REFERENCES `parent_chunks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chunk_lineage` ADD CONSTRAINT `chunk_lineage_parent_chunk_id_parent_chunks_id_fk` FOREIGN KEY (`parent_chunk_id`) REFERENCES `parent_chunks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chunk_lineage` ADD CONSTRAINT `chunk_lineage_child_chunk_id_child_chunks_id_fk` FOREIGN KEY (`child_chunk_id`) REFERENCES `child_chunks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `parent_chunks` ADD CONSTRAINT `parent_chunks_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_document_id` ON `child_chunks` (`document_id`);--> statement-breakpoint
CREATE INDEX `idx_parent_chunk_id` ON `child_chunks` (`parent_chunk_id`);--> statement-breakpoint
CREATE INDEX `idx_parent_chunk_id` ON `chunk_lineage` (`parent_chunk_id`);--> statement-breakpoint
CREATE INDEX `idx_child_chunk_id` ON `chunk_lineage` (`child_chunk_id`);--> statement-breakpoint
CREATE INDEX `idx_file_id` ON `documents` (`file_id`);--> statement-breakpoint
CREATE INDEX `idx_status` ON `documents` (`status`);--> statement-breakpoint
CREATE INDEX `idx_document_id` ON `parent_chunks` (`document_id`);