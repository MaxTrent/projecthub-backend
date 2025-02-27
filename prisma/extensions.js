const prisma = require('../prisma/client');

const prisma = new PrismaClient().$extends({
  model: {
    user: {
      async softDelete(id) {
        return prisma.user.update({
          where: { id },
          data: { email: null, role: 'student' }, 
        });
      },
    },
  },
});

module.exports = prisma;