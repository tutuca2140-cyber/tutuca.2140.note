ALTER TABLE `payments` MODIFY COLUMN `loanId` int;--> statement-breakpoint
ALTER TABLE `payments` ADD `vehicleFinancingId` int;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_vehicleFinancingId_vehicleFinancings_id_fk` FOREIGN KEY (`vehicleFinancingId`) REFERENCES `vehicleFinancings`(`id`) ON DELETE no action ON UPDATE no action;