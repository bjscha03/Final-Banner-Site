ALTER TABLE "order_items" ALTER COLUMN "material" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "pole_pockets" varchar(10) DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "subtotal_cents" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tax_cents" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_number" varchar(255);