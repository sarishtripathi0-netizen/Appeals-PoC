import { PrismaClient } from "@prisma/client";
import { seedBaseline } from "../src/seed";

const prisma = new PrismaClient();

seedBaseline(prisma)
  .then(() => console.log("Seeded demo data."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
