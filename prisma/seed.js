const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.setting.create({
    data: {
      maxFileSize: 50,
      defaultRole: 'student',
    },
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());