CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`username` varchar(255),
	`action` varchar(100) NOT NULL,
	`entity` varchar(100),
	`entityId` int,
	`databaseId` int,
	`details` text,
	`ipAddress` varchar(45),
	`userAgent` text,
	`status` enum('success','failed','warning') NOT NULL DEFAULT 'success',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`databaseId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`cpf` varchar(14),
	`email` varchar(320),
	`phone` varchar(20),
	`address` text,
	`city` varchar(100),
	`state` varchar(2),
	`zipCode` varchar(10),
	`notes` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `databases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`type` enum('novo','copia','existente') NOT NULL,
	`isActive` boolean NOT NULL DEFAULT false,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `databases_id` PRIMARY KEY(`id`),
	CONSTRAINT `databases_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`databaseId` int NOT NULL,
	`clientId` int NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`interestRate` decimal(5,2) NOT NULL,
	`installments` int NOT NULL,
	`installmentAmount` decimal(15,2) NOT NULL,
	`totalAmount` decimal(15,2) NOT NULL,
	`startDate` timestamp NOT NULL,
	`endDate` timestamp NOT NULL,
	`status` enum('ativo','pago','atrasado','cancelado') NOT NULL DEFAULT 'ativo',
	`description` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`databaseId` int NOT NULL,
	`loanId` int NOT NULL,
	`installmentNumber` int NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`paymentDate` timestamp NOT NULL,
	`dueDate` timestamp NOT NULL,
	`status` enum('pago','pendente','atrasado') NOT NULL DEFAULT 'pendente',
	`lateFee` decimal(15,2) DEFAULT '0.00',
	`interest` decimal(15,2) DEFAULT '0.00',
	`notes` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicleFinancings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`databaseId` int NOT NULL,
	`vehicleId` int NOT NULL,
	`clientId` int NOT NULL,
	`vehiclePrice` decimal(15,2) NOT NULL,
	`downPayment` decimal(15,2) NOT NULL,
	`financedAmount` decimal(15,2) NOT NULL,
	`interestRate` decimal(5,2) NOT NULL,
	`installments` int NOT NULL,
	`installmentAmount` decimal(15,2) NOT NULL,
	`totalAmount` decimal(15,2) NOT NULL,
	`startDate` timestamp NOT NULL,
	`endDate` timestamp NOT NULL,
	`status` enum('ativo','pago','atrasado','cancelado') NOT NULL DEFAULT 'ativo',
	`notes` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicleFinancings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`databaseId` int NOT NULL,
	`brand` varchar(100) NOT NULL,
	`model` varchar(100) NOT NULL,
	`year` int NOT NULL,
	`color` varchar(50),
	`plate` varchar(20),
	`chassi` varchar(50),
	`price` decimal(15,2) NOT NULL,
	`status` enum('disponivel','vendido','reservado') NOT NULL DEFAULT 'disponivel',
	`description` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','super_admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `canView` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `canInsert` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `canEdit` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `canDelete` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `canGenerateReports` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `canAccessSettings` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;