import { integer, pgTable, varchar, text, uuid, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const orders = pgTable('orders', {
    id: uuid().primaryKey().defaultRandom(),
    user_id: uuid(),
    total_cents: integer().notNull(),
    status: varchar({ length: 20 }).notNull().default('pending'),
    created_at: timestamp().defaultNow(),
    updated_at: timestamp().defaultNow()
});

export const orderItems = pgTable('order_items', {
    id: uuid().primaryKey().defaultRandom(),
    order_id: uuid().references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    width_in: integer().notNull(),
    height_in: integer().notNull(),
    quantity: integer().notNull().default(1),
    material: varchar({ length: 10 }).notNull(),
    grommets: varchar({ length: 50 }).notNull().default('none'),
    rope_feet: integer().default(0),
    line_total_cents: integer().notNull(),
    created_at: timestamp().defaultNow()
});