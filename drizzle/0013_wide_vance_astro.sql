CREATE TABLE `vehicle_sales` (
	`id` int AUTO_INCREMENT NOT NULL,
	`databaseId` int NOT NULL,
	`vehicleId` int NOT NULL,
	`clientId` int,
	`saleAmount` decimal(15,2) NOT NULL,
	`receivedAmount` decimal(15,2) NOT NULL DEFAULT '0.00',
	`receivableBalance` decimal(15,2) NOT NULL DEFAULT '0.00',
	`paymentMethod` varchar(30),
	`saleDate` timestamp NOT NULL,
	`notes` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicle_sales_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `vehicles` MODIFY COLUMN `brand` varchar(100);--> statement-breakpoint
ALTER TABLE `vehicles` MODIFY COLUMN `year` int;--> statement-breakpoint
ALTER TABLE `vehicles` MODIFY COLUMN `price` decimal(15,2) NOT NULL DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE `vehicles` MODIFY COLUMN `status` enum('disponivel','vendido','reservado','indisponivel') NOT NULL DEFAULT 'disponivel';--> statement-breakpoint
ALTER TABLE `cash_flow` ADD `vehicleId` int;--> statement-breakpoint
ALTER TABLE `cash_flow` ADD `vehicleSaleId` int;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `vehicleType` enum('CARRO','MOTO','OUTRO') DEFAULT 'OUTRO' NOT NULL;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `renavam` varchar(30);--> statement-breakpoint
ALTER TABLE `vehicles` ADD `mileage` int;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `purchasePrice` decimal(15,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `salePrice` decimal(15,2);--> statement-breakpoint
ALTER TABLE `vehicles` ADD `purchaseDate` timestamp;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `stockEntryDate` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `vehicle_sales` ADD CONSTRAINT `vehicle_sales_vehicleId_vehicles_id_fk` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicle_sales` ADD CONSTRAINT `vehicle_sales_clientId_clients_id_fk` FOREIGN KEY (`clientId`) REFERENCES `clients`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_flow` ADD CONSTRAINT `cash_flow_vehicleId_vehicles_id_fk` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_flow` ADD CONSTRAINT `cash_flow_vehicleSaleId_vehicle_sales_id_fk` FOREIGN KEY (`vehicleSaleId`) REFERENCES `vehicle_sales`(`id`) ON DELETE set null ON UPDATE no action;