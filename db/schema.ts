import { integer, pgTable, varchar, text, uuid, timestamp, jsonb, numeric, date } from 'drizzle-orm/pg-core';

export const orders = pgTable('orders', {
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid(),
    email: varchar({ length: 255 }),
    subtotal_cents: integer().notNull(),
    tax_cents: integer().notNull(),
    total_cents: integer().notNull(),
    status: varchar({ length: 20 }).notNull().default('pending'),
    tracking_number: varchar({ length: 255 }),
    created_at: timestamp().defaultNow(),
    updated_at: timestamp().defaultNow()
});

export const orderItems = pgTable('order_items', {
    id: uuid().primaryKey().defaultRandom(),
    order_id: uuid().references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    width_in: integer().notNull(),
    height_in: integer().notNull(),
    quantity: integer().notNull().default(1),
    material: varchar({ length: 50 }).notNull(),
    grommets: varchar({ length: 50 }).notNull().default('none'),
    rope_feet: integer().default(0),
    pole_pockets: varchar({ length: 10 }).default('none'),
    line_total_cents: integer().notNull(),
    file_key: varchar({ length: 255 }), // Customer uploaded file reference
    created_at: timestamp().defaultNow()
});

export const customQuoteRequests = pgTable('custom_quote_requests', {
    id: uuid().primaryKey().defaultRandom(),
    quote_number: varchar({ length: 20 }).unique().notNull(),
    status: varchar({ length: 20 }).notNull().default('New'),
    full_name: varchar({ length: 160 }).notNull(),
    company_name: varchar({ length: 160 }),
    email: varchar({ length: 255 }).notNull(),
    phone: varchar({ length: 40 }).notNull(),
    product_type: varchar({ length: 40 }).notNull(),
    width: numeric({ precision: 10, scale: 2 }).notNull(),
    height: numeric({ precision: 10, scale: 2 }).notNull(),
    unit: varchar({ length: 20 }).notNull(),
    quantity: integer().notNull(),
    material_specs: text(),
    finishing_options: text(),
    needed_by_date: date(),
    shipping_zip: varchar({ length: 20 }).notNull(),
    project_description: text().notNull(),
    additional_notes: text(),
    product_options: jsonb().notNull().default({}),
    artwork_files: jsonb().notNull().default([]),
    internal_notes: text(),
    created_at: timestamp().defaultNow(),
    updated_at: timestamp().defaultNow()
});
