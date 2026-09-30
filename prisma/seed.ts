import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { PrismaClient, UserRole } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL wajib di-set untuk menjalankan seed');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);

const users: Array<{
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
}> = [
  { username: 'manager01', password: 'Manager123!', fullName: 'Manager Utama', role: 'MANAGER' },
  { username: 'resepsionis01', password: 'Resepsionis123!', fullName: 'Resepsionis Satu', role: 'RECEPTIONIST' },
  { username: 'resepsionis02', password: 'Resepsionis123!', fullName: 'Resepsionis Dua', role: 'RECEPTIONIST' },
  { username: 'resepsionis03', password: 'Resepsionis123!', fullName: 'Resepsionis Tiga', role: 'RECEPTIONIST' },
  { username: 'resepsionis04', password: 'Resepsionis123!', fullName: 'Resepsionis Empat', role: 'RECEPTIONIST' },
];

async function main() {
  for (const user of users) {
    const passwordHash = await bcrypt.hash(user.password, saltRounds);
    await prisma.user.upsert({
      where: { username: user.username },
      update: { passwordHash, fullName: user.fullName, role: user.role, isActive: true },
      create: {
        username: user.username,
        passwordHash,
        fullName: user.fullName,
        role: user.role,
      },
    });
    console.log(`Upserted user: ${user.username} (${user.role})`);
  }
}

main()
  .catch((error) => {
    console.error('Seed gagal:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
