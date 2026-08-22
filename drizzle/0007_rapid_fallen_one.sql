ALTER TABLE `loans` MODIFY COLUMN `interestRate` decimal(8,4) NOT NULL;--> statement-breakpoint
ALTER TABLE `loans` ADD `interestType` enum('simple','compound') DEFAULT 'simple' NOT NULL;--> statement-breakpoint
ALTER TABLE `loans` ADD `ratePeriod` enum('day','week','month','year') DEFAULT 'month' NOT NULL;--> statement-breakpoint
ALTER TABLE `loans` ADD `remainingBalance` decimal(15,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `principalAmount` decimal(15,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `interestAmount` decimal(15,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `remainingBalance` decimal(15,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `clientId` int;--> statement-breakpoint
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_clientId_clients_id_fk` FOREIGN KEY (`clientId`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action;