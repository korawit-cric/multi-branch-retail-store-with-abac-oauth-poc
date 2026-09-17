import 'dotenv/config';
import prisma, { OrderStatus, RoleCode } from '../src/index';

const permissionCodes = [
  'store.read',
  'order.create',
  'order.read',
  'order.update_status',
  'order.refund',
  'inventory.adjust',
  'promotion.manage',
] as const;

const grants: Record<RoleCode, readonly string[]> = {
  CUSTOMER: ['order.read'],
  STORE_STAFF: [
    'store.read',
    'order.create',
    'order.read',
    'order.update_status',
  ],
  STORE_MANAGER: [
    'store.read',
    'order.create',
    'order.read',
    'order.update_status',
    'order.refund',
    'inventory.adjust',
  ],
  HQ_ADMIN: [
    'store.read',
    'order.read',
    'order.create',
    'order.update_status',
    'inventory.adjust',
  ],
};

async function main() {
  await prisma.$transaction(async (tx) => {
    for (const code of permissionCodes) {
      await tx.permission.upsert({
        where: { code },
        update: {},
        create: { code },
      });
    }

    for (const code of Object.values(RoleCode)) {
      const role = await tx.role.upsert({
        where: { code },
        update: {},
        create: { code },
      });
      const permissions = await tx.permission.findMany({
        where: { code: { in: [...grants[code]] } },
      });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
      });
    }

    for (const store of [
      {
        id: '10',
        name: 'Siam Square',
        address: 'Rama I Road, Bangkok',
        tenantId: 'thai-food',
        region: 'TH',
      },
      {
        id: '42',
        name: 'Ari Neighborhood',
        address: 'Phahonyothin Road, Bangkok',
        tenantId: 'thai-food',
        region: 'TH',
      },
      {
        id: 'other-10',
        name: 'Other company',
        address: 'Private branch',
        tenantId: 'other-company',
        region: 'TH',
      },
    ])
      await tx.store.upsert({
        where: { id: store.id },
        update: store,
        create: store,
      });

    const users = [
      {
        id: 'mock-customer',
        name: 'Customer',
        role: RoleCode.CUSTOMER,
        tenantId: 'thai-food',
        region: 'TH',
        refundLimit: 0,
        customerId: 'c-1',
        stores: [],
      },
      {
        id: 'mock-staff-10',
        name: 'Store 10 staff',
        role: RoleCode.STORE_STAFF,
        tenantId: 'thai-food',
        region: 'TH',
        refundLimit: 0,
        stores: ['10'],
      },
      {
        id: 'mock-manager-10',
        name: 'Store 10 manager',
        role: RoleCode.STORE_MANAGER,
        tenantId: 'thai-food',
        region: 'TH',
        refundLimit: 500,
        stores: ['10'],
      },
      {
        id: 'mock-manager-42',
        name: 'Store 42 manager',
        role: RoleCode.STORE_MANAGER,
        tenantId: 'thai-food',
        region: 'TH',
        refundLimit: 500,
        stores: ['42'],
      },
      {
        id: 'mock-hq',
        name: 'HQ admin',
        role: RoleCode.HQ_ADMIN,
        tenantId: 'thai-food',
        region: 'TH',
        refundLimit: 0,
        stores: ['10', '42'],
      },
    ];
    for (const user of users) {
      const role = await tx.role.findUniqueOrThrow({
        where: { code: user.role },
      });
      await tx.user.upsert({
        where: { id: user.id },
        update: {
          name: user.name,
          tenantId: user.tenantId,
          region: user.region,
          refundLimit: user.refundLimit,
          customerId: user.customerId,
          roleId: role.id,
        },
        create: {
          id: user.id,
          name: user.name,
          tenantId: user.tenantId,
          region: user.region,
          refundLimit: user.refundLimit,
          customerId: user.customerId,
          roleId: role.id,
        },
      });
      await tx.userStore.deleteMany({ where: { userId: user.id } });
      await tx.userStore.createMany({
        data: user.stores.map((storeId) => ({ userId: user.id, storeId })),
      });
    }

    const products = [
      {
        id: 'coffee',
        sku: 'BEV-001',
        name: 'Cold brew coffee',
        category: 'Beverages',
        price: 85,
        stock: 32,
      },
      {
        id: 'tea',
        sku: 'BEV-002',
        name: 'Thai milk tea',
        category: 'Beverages',
        price: 65,
        stock: 8,
      },
      {
        id: 'rice',
        sku: 'FOOD-001',
        name: 'Jasmine rice bowl',
        category: 'Kitchen',
        price: 120,
        stock: 24,
      },
      {
        id: 'cookie',
        sku: 'BAKE-001',
        name: 'Butter cookie',
        category: 'Bakery',
        price: 45,
        stock: 5,
      },
      {
        id: 'tote',
        sku: 'LIFE-001',
        name: 'Everyday canvas tote',
        category: 'Lifestyle',
        price: 250,
        stock: 18,
      },
    ];
    for (const { price, stock, ...product } of products) {
      await tx.product.upsert({
        where: { id: product.id },
        update: {},
        create: { ...product, tenantId: 'thai-food' },
      });
      for (const storeId of ['10', '42']) {
        const id = `${storeId}-${product.id}`;
        const exists = await tx.storeProduct.findUnique({ where: { id } });
        if (!exists)
          await tx.storeProduct.create({
            data: {
              id,
              storeId,
              productId: product.id,
              price: price + (storeId === '42' ? 5 : 0),
              stock,
              movements: {
                create: { quantityDelta: stock, reason: 'Opening inventory' },
              },
            },
          });
      }
    }

    const orders = [
      {
        id: '900',
        tenantId: 'thai-food',
        storeId: '42',
        region: 'TH',
        customerId: 'c-1',
        status: OrderStatus.PREPARING,
        total: 300,
      },
      {
        id: '901',
        tenantId: 'thai-food',
        storeId: '10',
        region: 'TH',
        customerId: 'c-2',
        status: OrderStatus.PAID,
        total: 300,
      },
      {
        id: '902',
        tenantId: 'thai-food',
        storeId: '10',
        region: 'TH',
        customerId: 'c-2',
        status: OrderStatus.PAID,
        total: 800,
      },
      {
        id: '903',
        tenantId: 'other-company',
        storeId: 'other-10',
        region: 'TH',
        customerId: 'c-1',
        status: OrderStatus.PAID,
        total: 100,
      },
    ];
    for (const order of orders)
      await tx.order.upsert({
        where: { id: order.id },
        update: {},
        create: order,
      });
  });
}

main()
  .then(() => console.info('Authorization seed completed.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
