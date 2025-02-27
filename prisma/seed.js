const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const validRoles = ['student', 'supervisor', 'admin'];

async function main() {
  try {
    console.log('Seeding database...');

    const defaultRole = 'student';
    if (!validRoles.includes(defaultRole)) {
      throw new Error(`Invalid default role: ${defaultRole}`);
    }

    await prisma.setting.upsert({
      where: { id: 1 }, // assuming `id` is always 1 for settings
      update: { maxFileSize: 50, defaultRole },
      create: { id: 1, maxFileSize: 50, defaultRole },
    });

    console.log('Database seeded successfully.');
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();