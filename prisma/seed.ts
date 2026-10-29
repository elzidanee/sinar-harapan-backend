try {
  process.loadEnvFile?.();
} catch {
  // Abaikan jika .env tidak ada (mis. di environment Railway / production)
}
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { PrismaClient, UserRole, RoomStatus } from '../src/generated/prisma/client.js';

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
  { username: 'manager01', password: 'Manager123!', fullName: 'Manager Utama (Bambang)', role: 'MANAGER' },
  { username: 'resepsionis01', password: 'Resepsionis123!', fullName: 'Siti Rahma (Shift Pagi)', role: 'RECEPTIONIST' },
  { username: 'resepsionis02', password: 'Resepsionis123!', fullName: 'Budi Santoso (Shift Siang)', role: 'RECEPTIONIST' },
  { username: 'resepsionis03', password: 'Resepsionis123!', fullName: 'Dewi Lestari (Shift Malam)', role: 'RECEPTIONIST' },
  { username: 'resepsionis04', password: 'Resepsionis123!', fullName: 'Rian Pratama (Shift Cadangan)', role: 'RECEPTIONIST' },
];

const rooms: Array<{
  roomNumber: string;
  roomType: string;
  floor: number;
  basePricePerNight: number;
  facilities: string[];
  status: RoomStatus;
}> = [
  // Lantai 1
  {
    roomNumber: '101',
    roomType: 'Standard',
    floor: 1,
    basePricePerNight: 200000,
    facilities: ['AC', 'TV', 'WiFi', 'Double Bed', 'Amenities', 'Air Mineral'],
    status: 'AVAILABLE',
  },
  {
    roomNumber: '102',
    roomType: 'Standard',
    floor: 1,
    basePricePerNight: 200000,
    facilities: ['AC', 'TV', 'WiFi', 'Twin Bed', 'Amenities', 'Air Mineral'],
    status: 'AVAILABLE',
  },
  {
    roomNumber: '103',
    roomType: 'Standard',
    floor: 1,
    basePricePerNight: 200000,
    facilities: ['AC', 'TV', 'WiFi', 'Double Bed', 'Amenities'],
    status: 'DIRTY',
  },
  {
    roomNumber: '104',
    roomType: 'Superior',
    floor: 1,
    basePricePerNight: 250000,
    facilities: ['AC', 'Smart TV', 'WiFi', 'Queen Bed', 'Water Heater', 'Amenities', 'Air Mineral'],
    status: 'AVAILABLE',
  },
  {
    roomNumber: '105',
    roomType: 'Superior',
    floor: 1,
    basePricePerNight: 250000,
    facilities: ['AC', 'Smart TV', 'WiFi', 'Twin Bed', 'Water Heater', 'Amenities', 'Air Mineral'],
    status: 'OCCUPIED',
  },
  {
    roomNumber: '106',
    roomType: 'Superior',
    floor: 1,
    basePricePerNight: 250000,
    facilities: ['AC', 'Smart TV', 'WiFi', 'Queen Bed', 'Water Heater', 'Amenities'],
    status: 'AVAILABLE',
  },

  // Lantai 2
  {
    roomNumber: '201',
    roomType: 'Superior',
    floor: 2,
    basePricePerNight: 250000,
    facilities: ['AC', 'Smart TV', 'WiFi', 'Queen Bed', 'Water Heater', 'Amenities', 'Air Mineral'],
    status: 'AVAILABLE',
  },
  {
    roomNumber: '202',
    roomType: 'Deluxe',
    floor: 2,
    basePricePerNight: 350000,
    facilities: ['AC', 'Smart TV 43"', 'High-Speed WiFi', 'King Bed', 'Water Heater', 'Kulkas Mini', 'Balkon', 'Amenities'],
    status: 'AVAILABLE',
  },
  {
    roomNumber: '203',
    roomType: 'Deluxe',
    floor: 2,
    basePricePerNight: 350000,
    facilities: ['AC', 'Smart TV 43"', 'High-Speed WiFi', 'King Bed', 'Water Heater', 'Kulkas Mini', 'Balkon', 'Amenities'],
    status: 'OCCUPIED',
  },
  {
    roomNumber: '204',
    roomType: 'Deluxe',
    floor: 2,
    basePricePerNight: 350000,
    facilities: ['AC', 'Smart TV 43"', 'High-Speed WiFi', 'King Bed', 'Water Heater', 'Kulkas Mini', 'Balkon', 'Amenities'],
    status: 'AVAILABLE',
  },
  {
    roomNumber: '205',
    roomType: 'Family',
    floor: 2,
    basePricePerNight: 500000,
    facilities: ['AC (2 Unit)', 'Smart TV 50"', 'High-Speed WiFi', '1 King Bed + 1 Single Bed', 'Water Heater', 'Sofa', 'Kulkas Mini', 'Amenities Lengkap'],
    status: 'AVAILABLE',
  },
  {
    roomNumber: '206',
    roomType: 'Family',
    floor: 2,
    basePricePerNight: 500000,
    facilities: ['AC (2 Unit)', 'Smart TV 50"', 'High-Speed WiFi', '2 Queen Beds', 'Water Heater', 'Sofa', 'Kulkas Mini', 'Amenities Lengkap'],
    status: 'MAINTENANCE',
  },
];

async function main() {
  console.log('Seeding users...');
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
    console.log(`Upserted user: ${user.username} (${user.role}) - ${user.fullName}`);
  }

  console.log('\nSeeding rooms...');
  for (const room of rooms) {
    await prisma.room.upsert({
      where: { roomNumber: room.roomNumber },
      update: {
        roomType: room.roomType,
        floor: room.floor,
        basePricePerNight: room.basePricePerNight,
        facilities: room.facilities,
        status: room.status,
      },
      create: {
        roomNumber: room.roomNumber,
        roomType: room.roomType,
        floor: room.floor,
        basePricePerNight: room.basePricePerNight,
        facilities: room.facilities,
        status: room.status,
      },
    });
    console.log(`Upserted room: ${room.roomNumber} (${room.roomType} - Lt. ${room.floor} - ${room.status})`);
  }
}

main()
  .catch((error) => {
    console.error('Seed gagal:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
