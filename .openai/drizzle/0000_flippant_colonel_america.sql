CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`public_token` text NOT NULL,
	`status` text NOT NULL,
	`submitted_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`accepted_at` text,
	`rejected_at` text,
	`completed_at` text,
	`printed_at` text,
	`pickup_minutes` integer NOT NULL,
	`customer_json` text NOT NULL,
	`notes` text NOT NULL,
	`items_json` text NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`fee_cents` integer NOT NULL,
	`tax_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`payment_mode` text NOT NULL,
	`payment_status` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_public_token_unique` ON `orders` (`public_token`);--> statement-breakpoint
CREATE TABLE `restaurant_settings` (
	`restaurant_id` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text NOT NULL
);
