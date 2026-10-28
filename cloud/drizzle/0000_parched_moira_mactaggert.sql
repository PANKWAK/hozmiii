CREATE TABLE `g2g_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`route_id` text NOT NULL,
	`encrypted_credentials` text NOT NULL,
	`last_event_at` text,
	`last_sync_at` text,
	`last_error` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `g2g_route_unique` ON `g2g_connections` (`route_id`);--> statement-breakpoint
CREATE TABLE `g2g_events` (
	`route_id` text NOT NULL,
	`event_id` text NOT NULL,
	`received_at` text NOT NULL,
	PRIMARY KEY(`route_id`, `event_id`)
);
--> statement-breakpoint
CREATE TABLE `cloud_orders` (
	`user_id` text NOT NULL,
	`order_key` text NOT NULL,
	`body_json` text NOT NULL,
	PRIMARY KEY(`user_id`, `order_key`)
);
--> statement-breakpoint
CREATE TABLE `cloud_states` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`imports_json` text DEFAULT '[]' NOT NULL,
	`groups_json` text DEFAULT '{}' NOT NULL,
	`updated_at` text NOT NULL
);
