
const { PrismaClient } = require('@prisma/client');

//create the base client
const prismaBase = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Add logging middleware to the base client
prismaBase.$use(async (params, next) => {
  const before = Date.now();
  const result = await next(params);
  const after = Date.now();
  
  console.log(
    `Query ${params.model}.${params.action} took ${after - before}ms`,
    JSON.stringify(params.args, null, 2)
  );
  
  return result;
});

//extend it and export the extended version
const prisma = prismaBase.$extends({
  model: {
    user: {
      async softDelete(id) {
        return prismaBase.user.update({
          where: { id },
          data: { email: null, role: 'student' },
        });
      },
    },
  },
});

module.exports = prisma;