/**
 * AgriShield Parametric - Database Seed Script
 * Executed via Prisma seed (`npx prisma db seed`) or `npm run seed`.
 */

import { prisma, disconnectDatabase } from '../src/config/db.js';
import { seedRiskRules } from '../src/config/seedRiskRules.js';

async function main() {
  console.log('🌱 Starting database seeding...');
  const result = await seedRiskRules(prisma);
  console.log(`✅ Database seeding completed. Processed ${result.rulesProcessed} rules:`);
  result.ruleCodes.forEach((code, idx) => {
    console.log(`   ${idx + 1}. ${code}`);
  });
}

main()
  .catch((e) => {
    console.error('❌ Database seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectDatabase();
  });
