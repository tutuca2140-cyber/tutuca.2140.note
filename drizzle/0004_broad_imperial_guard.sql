CREATE TABLE `agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`databaseId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`defaultCommissionPercentage` decimal(5,2) NOT NULL DEFAULT '0.00',
	`status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `payments` ADD `agentId` int;--> statement-breakpoint
ALTER TABLE `payments` ADD `commissionPercentage` decimal(5,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `commissionAmount` decimal(15,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `netAmount` decimal(15,2) DEFAULT '0.00' NOT NULL;