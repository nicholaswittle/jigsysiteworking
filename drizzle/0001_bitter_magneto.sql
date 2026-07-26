CREATE TABLE `square_connections` (
	`restaurant_id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`merchant_id` text NOT NULL,
	`location_id` text NOT NULL,
	`location_name` text NOT NULL,
	`access_token_encrypted` text NOT NULL,
	`refresh_token_encrypted` text NOT NULL,
	`expires_at` text NOT NULL,
	`scopes_json` text NOT NULL,
	`connected_at` text NOT NULL,
	`updated_at` text NOT NULL
);
