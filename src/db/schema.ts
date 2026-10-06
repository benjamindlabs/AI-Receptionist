import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const reservationStatusEnum = pgEnum('reservation_status', [
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/**
 * business
 *
 * Stores the authoritative core information about the restaurant.
 * Single-tenant: exactly one row for Presh's Kitchen.
 */
export const business = pgTable('business', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  country: text('country').notNull(),
  phone: text('phone').notNull(),
  website: text('website').notNull(),
  timezone: text('timezone').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * business_hours
 *
 * Stores the normal weekly opening schedule.
 * day_of_week: 0 = Sunday … 6 = Saturday.
 * open_time / close_time are nullable to represent closed days alongside is_closed.
 */
export const businessHours = pgTable(
  'business_hours',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(),
    openTime: time('open_time'),
    closeTime: time('close_time'),
    isClosed: boolean('is_closed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('business_hours_business_id_day_of_week_unique').on(t.businessId, t.dayOfWeek)],
);

/**
 * menu_categories
 *
 * Groups menu items. Ordered by display_order ascending.
 */
export const menuCategories = pgTable(
  'menu_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('menu_categories_business_id_idx').on(t.businessId)],
);

/**
 * menu_items
 *
 * Stores the authoritative restaurant menu. Prices are in NGN by default.
 * ON DELETE RESTRICT on category_id prevents orphaned items.
 */
export const menuItems = pgTable(
  'menu_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => menuCategories.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    isAvailable: boolean('is_available').notNull().default(true),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('menu_items_business_id_idx').on(t.businessId),
    index('menu_items_category_id_idx').on(t.categoryId),
    index('menu_items_business_id_is_available_idx').on(t.businessId, t.isAvailable),
  ],
);

/**
 * customers
 *
 * Customers who interact with the restaurant and can be linked to reservations.
 * phone is not globally unique at this stage (intentional MVP decision).
 */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('customers_phone_idx').on(t.phone)],
);

/**
 * reservations
 *
 * Stores actual restaurant reservations.
 * customer_name / customer_phone are denormalised for operational convenience
 * (a customer's contact details may change; the reservation record is a snapshot).
 */
export const reservations = pgTable(
  'reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    reservationAt: timestamp('reservation_at', { withTimezone: true }).notNull(),
    partySize: integer('party_size').notNull(),
    status: reservationStatusEnum('status').notNull().default('pending'),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    specialRequests: text('special_requests'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    index('reservations_business_id_idx').on(t.businessId),
    index('reservations_customer_id_idx').on(t.customerId),
    index('reservations_business_id_reservation_at_idx').on(t.businessId, t.reservationAt),
    index('reservations_business_id_reservation_at_status_idx').on(
      t.businessId,
      t.reservationAt,
      t.status,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Business = typeof business.$inferSelect;
export type NewBusiness = typeof business.$inferInsert;

export type BusinessHours = typeof businessHours.$inferSelect;
export type NewBusinessHours = typeof businessHours.$inferInsert;

export type MenuCategory = typeof menuCategories.$inferSelect;
export type NewMenuCategory = typeof menuCategories.$inferInsert;

export type MenuItem = typeof menuItems.$inferSelect;
export type NewMenuItem = typeof menuItems.$inferInsert;

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;

export type ReservationStatus = (typeof reservationStatusEnum.enumValues)[number];
