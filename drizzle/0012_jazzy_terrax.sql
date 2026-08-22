ALTER TABLE `cash_flow` DROP FOREIGN KEY `cash_flow_clientId_clients_id_fk`;
--> statement-breakpoint
ALTER TABLE `cash_flow` DROP FOREIGN KEY `cash_flow_loanId_loans_id_fk`;
--> statement-breakpoint
ALTER TABLE `cash_flow` ADD CONSTRAINT `cash_flow_clientId_clients_id_fk` FOREIGN KEY (`clientId`) REFERENCES `clients`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_flow` ADD CONSTRAINT `cash_flow_loanId_loans_id_fk` FOREIGN KEY (`loanId`) REFERENCES `loans`(`id`) ON DELETE set null ON UPDATE no action;