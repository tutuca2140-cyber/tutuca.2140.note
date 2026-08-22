CREATE TABLE `loan_interest_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`databaseId` int NOT NULL,
	`loanId` int NOT NULL,
	`periodReference` varchar(20) NOT NULL,
	`previousPrincipalBalance` decimal(15,2) NOT NULL,
	`interestGenerated` decimal(15,2) NOT NULL,
	`paymentAmount` decimal(15,2) NOT NULL DEFAULT '0.00',
	`interestPaid` decimal(15,2) NOT NULL DEFAULT '0.00',
	`principalAmortized` decimal(15,2) NOT NULL DEFAULT '0.00',
	`updatedPrincipalBalance` decimal(15,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `loan_interest_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `birthDate` timestamp;--> statement-breakpoint
ALTER TABLE `clients` ADD `whatsapp` varchar(20);--> statement-breakpoint
ALTER TABLE `clients` ADD `profession` varchar(120);--> statement-breakpoint
ALTER TABLE `clients` ADD `indicatorAgentId` int;--> statement-breakpoint
ALTER TABLE `clients` ADD `residentialAddress` json;--> statement-breakpoint
ALTER TABLE `clients` ADD `commercialAddress` json;--> statement-breakpoint
ALTER TABLE `loans` ADD `principalBalance` decimal(15,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `loans` ADD `accruedInterest` decimal(15,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `loans` ADD `totalPaid` decimal(15,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `loans` ADD `lastInterestPeriod` varchar(20);--> statement-breakpoint
ALTER TABLE `loan_interest_history` ADD CONSTRAINT `loan_interest_history_loanId_loans_id_fk` FOREIGN KEY (`loanId`) REFERENCES `loans`(`id`) ON DELETE no action ON UPDATE no action;