
const prisma = require('../prisma/client');



prisma.$use(async (params, next) => {
  const before = Date.now();
  const result = await next(params);
  const after = Date.now();
  
  console.log(
    `Query ${params.model}.${params.action} took ${after - before}ms`,
    JSON.stringify(params.args, null, 2)
  );
  
  return result;
});

module.exports = prisma;