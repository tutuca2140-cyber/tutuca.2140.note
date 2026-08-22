ALTER TABLE `cash_flow` ADD `sourceKey` varchar(180);--> statement-breakpoint
ALTER TABLE `cash_flow` ADD CONSTRAINT `cash_flow_source_key_unique` UNIQUE(`sourceKey`);