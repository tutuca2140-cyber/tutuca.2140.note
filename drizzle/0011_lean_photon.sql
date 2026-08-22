ALTER TABLE `cash_flow` DROP FOREIGN KEY `cash_flow_paymentId_payments_id_fk`;
--> statement-breakpoint
ALTER TABLE `cash_flow` ADD CONSTRAINT `cash_flow_paymentId_payments_id_fk` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE set null ON UPDATE no action;