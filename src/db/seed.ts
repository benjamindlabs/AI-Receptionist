/**
 * src/db/seed.ts
 *
 * Idempotent seed script for Presh's Kitchen.
 *
 * Populates:
 *   - business          (1 record)
 *   - business_hours    (7 records)
 *   - menu_categories   (6 records)
 *   - menu_items        (27 records)
 *
 * Leaves empty:
 *   - customers
 *   - reservations
 *
 * Safe to run multiple times. All records use stable deterministic UUIDs so
 * subsequent runs upsert rather than duplicate.
 */

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

// ---------------------------------------------------------------------------
// Stable deterministic UUIDs
// ---------------------------------------------------------------------------

const BUSINESS_ID = '11111111-0001-4000-a000-000000000001';

const HOURS_IDS: Record<number, string> = {
  0: '22222222-0000-4000-a000-000000000001',
  1: '22222222-0001-4000-a000-000000000001',
  2: '22222222-0002-4000-a000-000000000001',
  3: '22222222-0003-4000-a000-000000000001',
  4: '22222222-0004-4000-a000-000000000001',
  5: '22222222-0005-4000-a000-000000000001',
  6: '22222222-0006-4000-a000-000000000001',
};

const CAT_STARTERS        = '33333333-0001-4000-a000-000000000001';
const CAT_MAINS           = '33333333-0002-4000-a000-000000000001';
const CAT_SOUPS_SWALLOWS  = '33333333-0003-4000-a000-000000000001';
const CAT_GRILLS_SPECIALS = '33333333-0004-4000-a000-000000000001';
const CAT_SIDES           = '33333333-0005-4000-a000-000000000001';
const CAT_DRINKS          = '33333333-0006-4000-a000-000000000001';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const businessData: schema.NewBusiness = {
  id:       BUSINESS_ID,
  name:     "Presh's Kitchen",
  address:  '15 Ekenwan Road',
  city:     'Benin City',
  state:    'Edo State',
  country:  'Nigeria',
  phone:    '+234 800 555 0147',
  website:  'https://preshskitchen-demo.vercel.app',
  timezone: 'Africa/Lagos',
};

const businessHoursData: schema.NewBusinessHours[] = [
  { id: HOURS_IDS[0], businessId: BUSINESS_ID, dayOfWeek: 0, openTime: '12:00', closeTime: '22:00', isClosed: false },
  { id: HOURS_IDS[1], businessId: BUSINESS_ID, dayOfWeek: 1, openTime: '10:00', closeTime: '22:00', isClosed: false },
  { id: HOURS_IDS[2], businessId: BUSINESS_ID, dayOfWeek: 2, openTime: '10:00', closeTime: '22:00', isClosed: false },
  { id: HOURS_IDS[3], businessId: BUSINESS_ID, dayOfWeek: 3, openTime: '10:00', closeTime: '22:00', isClosed: false },
  { id: HOURS_IDS[4], businessId: BUSINESS_ID, dayOfWeek: 4, openTime: '10:00', closeTime: '22:00', isClosed: false },
  { id: HOURS_IDS[5], businessId: BUSINESS_ID, dayOfWeek: 5, openTime: '10:00', closeTime: '23:00', isClosed: false },
  { id: HOURS_IDS[6], businessId: BUSINESS_ID, dayOfWeek: 6, openTime: '10:00', closeTime: '23:00', isClosed: false },
];

const categoriesData: schema.NewMenuCategory[] = [
  { id: CAT_STARTERS,        businessId: BUSINESS_ID, name: 'STARTERS',         displayOrder: 1 },
  { id: CAT_MAINS,           businessId: BUSINESS_ID, name: 'MAIN COURSES',      displayOrder: 2 },
  { id: CAT_SOUPS_SWALLOWS,  businessId: BUSINESS_ID, name: 'SOUPS & SWALLOWS',  displayOrder: 3 },
  { id: CAT_GRILLS_SPECIALS, businessId: BUSINESS_ID, name: 'GRILLS & SPECIALS', displayOrder: 4 },
  { id: CAT_SIDES,           businessId: BUSINESS_ID, name: 'SIDES',             displayOrder: 5 },
  { id: CAT_DRINKS,          businessId: BUSINESS_ID, name: 'DRINKS',            displayOrder: 6 },
];

const menuItemsData: schema.NewMenuItem[] = [
  // ── STARTERS ────────────────────────────────────────────────────────────
  {
    id: '44444444-0001-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_STARTERS,
    name: 'Chicken Pepper Soup',
    description: 'Spicy Nigerian-style pepper soup with tender chicken pieces and aromatic spices.',
    price: '7500.00', currency: 'NGN', isAvailable: true, displayOrder: 1,
  },
  {
    id: '44444444-0002-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_STARTERS,
    name: 'Goat Meat Pepper Soup',
    description: 'Rich and spicy pepper soup prepared with tender goat meat and traditional Nigerian spices.',
    price: '8500.00', currency: 'NGN', isAvailable: true, displayOrder: 2,
  },
  {
    id: '44444444-0003-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_STARTERS,
    name: 'Fried Plantain',
    description: 'Golden fried ripe plantain served as a side or starter.',
    price: '4000.00', currency: 'NGN', isAvailable: true, displayOrder: 3,
  },
  {
    id: '44444444-0004-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_STARTERS,
    name: 'Chicken Wings',
    description: 'Seasoned chicken wings served with a house dipping sauce.',
    price: '8500.00', currency: 'NGN', isAvailable: true, displayOrder: 4,
  },

  // ── MAIN COURSES ─────────────────────────────────────────────────────────
  {
    id: '44444444-0005-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_MAINS,
    name: 'Jollof Rice & Grilled Chicken',
    description: 'Nigerian party-style jollof rice served with grilled chicken and fried plantain.',
    price: '12500.00', currency: 'NGN', isAvailable: true, displayOrder: 1,
  },
  {
    id: '44444444-0006-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_MAINS,
    name: 'Jollof Rice & Fried Chicken',
    description: 'Nigerian jollof rice served with crispy fried chicken and fried plantain.',
    price: '12000.00', currency: 'NGN', isAvailable: true, displayOrder: 2,
  },
  {
    id: '44444444-0007-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_MAINS,
    name: 'Nigerian Fried Rice & Chicken',
    description: 'Nigerian-style fried rice with mixed vegetables served with grilled chicken.',
    price: '13000.00', currency: 'NGN', isAvailable: true, displayOrder: 3,
  },
  {
    id: '44444444-0008-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_MAINS,
    name: 'Native Rice & Fish',
    description: 'Traditional Nigerian native rice cooked with local spices and served with grilled fish.',
    price: '15000.00', currency: 'NGN', isAvailable: true, displayOrder: 4,
  },
  {
    id: '44444444-0009-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_MAINS,
    name: 'Ofada Rice & Sauce',
    description: 'Local Ofada rice served with traditional spicy ayamase sauce and assorted meat.',
    price: '14500.00', currency: 'NGN', isAvailable: true, displayOrder: 5,
  },
  {
    id: '44444444-0010-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_MAINS,
    name: 'Yam Porridge',
    description: 'Soft yam cooked in a rich tomato and pepper sauce with traditional Nigerian seasoning.',
    price: '10000.00', currency: 'NGN', isAvailable: true, displayOrder: 6,
  },

  // ── SOUPS & SWALLOWS ─────────────────────────────────────────────────────
  {
    id: '44444444-0011-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_SOUPS_SWALLOWS,
    name: 'Pounded Yam & Egusi Soup',
    description: 'Smooth pounded yam served with rich Nigerian egusi soup and assorted meat.',
    price: '15000.00', currency: 'NGN', isAvailable: true, displayOrder: 1,
  },
  {
    id: '44444444-0012-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_SOUPS_SWALLOWS,
    name: 'Pounded Yam & Oha Soup',
    description: 'Traditional pounded yam served with rich Oha soup and assorted meat.',
    price: '15000.00', currency: 'NGN', isAvailable: true, displayOrder: 2,
  },
  {
    id: '44444444-0013-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_SOUPS_SWALLOWS,
    name: 'Eba & Egusi Soup',
    description: 'Garri-based eba served with rich egusi soup and assorted meat.',
    price: '14000.00', currency: 'NGN', isAvailable: true, displayOrder: 3,
  },
  {
    id: '44444444-0014-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_SOUPS_SWALLOWS,
    name: 'Eba & Oha Soup',
    description: 'Eba served with traditional Oha soup and assorted meat.',
    price: '14000.00', currency: 'NGN', isAvailable: true, displayOrder: 4,
  },
  {
    id: '44444444-0015-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_SOUPS_SWALLOWS,
    name: 'Starch & Banga Soup',
    description: 'Traditional Edo-style starch served with rich palm-fruit Banga soup and assorted meat.',
    price: '15000.00', currency: 'NGN', isAvailable: true, displayOrder: 5,
  },

  // ── GRILLS & SPECIALS ────────────────────────────────────────────────────
  {
    id: '44444444-0016-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_GRILLS_SPECIALS,
    name: 'Grilled Croaker Fish',
    description: 'Whole seasoned croaker fish grilled and served with spicy pepper sauce and plantain.',
    price: '18000.00', currency: 'NGN', isAvailable: true, displayOrder: 1,
  },
  {
    id: '44444444-0017-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_GRILLS_SPECIALS,
    name: 'Grilled Catfish',
    description: 'Nigerian-style grilled catfish served with pepper sauce and fried plantain.',
    price: '17000.00', currency: 'NGN', isAvailable: true, displayOrder: 2,
  },
  {
    id: '44444444-0018-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_GRILLS_SPECIALS,
    name: 'Asun',
    description: 'Smoky grilled goat meat tossed in onions and spicy peppers.',
    price: '12000.00', currency: 'NGN', isAvailable: true, displayOrder: 3,
  },
  {
    id: '44444444-0019-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_GRILLS_SPECIALS,
    name: 'Suya Platter',
    description: 'Nigerian-style grilled beef skewers served with onions and spicy suya pepper.',
    price: '11000.00', currency: 'NGN', isAvailable: true, displayOrder: 4,
  },

  // ── SIDES ────────────────────────────────────────────────────────────────
  {
    id: '44444444-0020-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_SIDES,
    name: 'White Rice',
    description: 'Steamed white rice.',
    price: '3500.00', currency: 'NGN', isAvailable: true, displayOrder: 1,
  },
  {
    // Fried Plantain SIDES variant — distinct from the STARTERS variant above
    id: '44444444-0021-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_SIDES,
    name: 'Fried Plantain',
    description: 'Sweet ripe plantain fried until golden.',
    price: '4000.00', currency: 'NGN', isAvailable: true, displayOrder: 2,
  },
  {
    id: '44444444-0022-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_SIDES,
    name: 'Extra Jollof Rice',
    description: 'Additional serving of Nigerian jollof rice.',
    price: '4500.00', currency: 'NGN', isAvailable: true, displayOrder: 3,
  },
  {
    id: '44444444-0023-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_SIDES,
    name: 'Coleslaw',
    description: 'Fresh creamy cabbage and carrot salad.',
    price: '3500.00', currency: 'NGN', isAvailable: true, displayOrder: 4,
  },

  // ── DRINKS ───────────────────────────────────────────────────────────────
  {
    id: '44444444-0024-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_DRINKS,
    name: 'Chapman',
    description: 'Classic Nigerian non-alcoholic Chapman cocktail.',
    price: '4500.00', currency: 'NGN', isAvailable: true, displayOrder: 1,
  },
  {
    id: '44444444-0025-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_DRINKS,
    name: 'Zobo',
    description: 'Chilled Nigerian hibiscus drink infused with fruit and spices.',
    price: '3000.00', currency: 'NGN', isAvailable: true, displayOrder: 2,
  },
  {
    id: '44444444-0026-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_DRINKS,
    name: 'Fresh Fruit Juice',
    description: 'Freshly prepared seasonal fruit juice.',
    price: '4500.00', currency: 'NGN', isAvailable: true, displayOrder: 3,
  },
  {
    id: '44444444-0027-4000-a000-000000000001',
    businessId: BUSINESS_ID, categoryId: CAT_DRINKS,
    name: 'Bottled Water',
    description: 'Chilled bottled water.',
    price: '1000.00', currency: 'NGN', isAvailable: true, displayOrder: 4,
  },
];

// ---------------------------------------------------------------------------
// Seed runner
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required but not set.');
  }

  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });

  console.log("Seeding Presh's Kitchen database…");

  // 1. Business
  await db
    .insert(schema.business)
    .values(businessData)
    .onConflictDoUpdate({
      target: schema.business.id,
      set: {
        name:      businessData.name,
        address:   businessData.address,
        city:      businessData.city,
        state:     businessData.state,
        country:   businessData.country,
        phone:     businessData.phone,
        website:   businessData.website,
        timezone:  businessData.timezone,
        updatedAt: sql`now()`,
      },
    });
  console.log('  business record upserted');

  // 2. Business hours
  for (const row of businessHoursData) {
    await db
      .insert(schema.businessHours)
      .values(row)
      .onConflictDoUpdate({
        target: schema.businessHours.id,
        set: {
          openTime:  row.openTime,
          closeTime: row.closeTime,
          isClosed:  row.isClosed,
          updatedAt: sql`now()`,
        },
      });
  }
  console.log('  7 business_hours records upserted');

  // 3. Menu categories
  for (const cat of categoriesData) {
    await db
      .insert(schema.menuCategories)
      .values(cat)
      .onConflictDoUpdate({
        target: schema.menuCategories.id,
        set: {
          name:         cat.name,
          displayOrder: cat.displayOrder,
          updatedAt:    sql`now()`,
        },
      });
  }
  console.log('  6 menu_categories records upserted');

  // 4. Menu items
  for (const item of menuItemsData) {
    await db
      .insert(schema.menuItems)
      .values(item)
      .onConflictDoUpdate({
        target: schema.menuItems.id,
        set: {
          name:         item.name,
          description:  item.description,
          price:        item.price,
          currency:     item.currency,
          isAvailable:  item.isAvailable,
          displayOrder: item.displayOrder,
          updatedAt:    sql`now()`,
        },
      });
  }
  console.log(`  ${menuItemsData.length} menu_items records upserted`);

  await client.end({ timeout: 5 });
  console.log('Seed completed successfully. Connection closed cleanly.');
}

seed().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
