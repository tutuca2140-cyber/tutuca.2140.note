CREATE TABLE `cash_flow` (
	`id` int AUTO_INCREMENT NOT NULL,
	`databaseId` int NOT NULL,
	`type` enum('ENTRADA','SAIDA') NOT NULL,
	`category` varchar(120) NOT NULL,
	`description` text NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`movementDate` timestamp NOT NULL,
	`clientId` int,
	`loanId` int,
	`paymentId` int,
	`responsible` varchar(255),
	`notes` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cash_flow_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cash_flow` ADD CONSTRAINT `cash_flow_clientId_clients_id_fk` FOREIGN KEY (`clientId`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_flow` ADD CONSTRAINT `cash_flow_loanId_loans_id_fk` FOREIGN KEY (`loanId`) REFERENCES `loans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_flow` ADD CONSTRAINT `cash_flow_paymentId_payments_id_fk` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;