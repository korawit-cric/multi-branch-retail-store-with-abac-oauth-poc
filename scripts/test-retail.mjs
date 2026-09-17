/* global fetch, process, console */
// Run against the seeded LOCAL demo API. Creates a test sale and audit entries.
import assert from 'node:assert/strict';
import 'dotenv/config';
const api = process.env.API_PUBLIC_URL || 'http://localhost:3001';
const origin = process.env.WEB_ORIGIN || 'http://localhost:3000';
async function login(persona) {
  const jar = new Map();
  let url = `${api}/auth/login?persona=${persona}`;
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [key, ...value] = cookie.split(';')[0].split('=');
      jar.set(key, value.join('='));
    }
    const next = response.headers.get('location');
    assert.ok(next, `OAuth redirect missing: ${response.status}`);
    if (next === `${origin}/dashboard`) {
      assert.ok(jar.get('app_session'));
      return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    assert.ok(next.startsWith(api), 'Unexpected OAuth redirect');
    url = next;
  }
  throw new Error('Login did not complete');
}
async function request(
  cookie,
  path,
  body,
  method = 'POST',
  requestOrigin = origin,
) {
  return fetch(api + path, {
    method,
    redirect: 'manual',
    headers: {
      cookie,
      origin: requestOrigin,
      'content-type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function dashboard(cookie) {
  const r = await request(cookie, '/retail', null, 'GET');
  assert.equal(r.status, 200);
  return r.json();
}
assert.equal((await request('', '/retail', null, 'GET')).status, 401);
const manager = await login('mock-manager-10');
const staff = await login('mock-staff-10');
const hq = await login('mock-hq');
const other = await login('mock-manager-42');
assert.deepEqual(
  (await dashboard(manager)).stores.map((s) => s.id),
  ['10'],
);
assert.deepEqual(
  (await dashboard(other)).stores.map((s) => s.id),
  ['42'],
);
assert.deepEqual(
  (await dashboard(hq)).stores.map((s) => s.id),
  ['10', '42'],
);
assert.equal(
  (
    await request(staff, '/retail/inventory/10-coffee/adjust', {
      delta: 1,
      reason: 'Test delivery',
    })
  ).status,
  403,
);
assert.equal(
  (
    await request(manager, '/retail/inventory/42-coffee/adjust', {
      delta: 1,
      reason: 'Cross branch',
    })
  ).status,
  403,
);
assert.equal(
  (
    await request(manager, '/retail/sales', {
      storeProductId: '42-coffee',
      quantity: 1,
    })
  ).status,
  403,
);
assert.equal(
  (
    await request(manager, '/retail/sales', {
      storeProductId: '10-coffee',
      quantity: 0,
    })
  ).status,
  400,
);
assert.equal(
  (
    await request(
      manager,
      '/retail/sales',
      { storeProductId: '10-coffee', quantity: 1 },
      'POST',
      'https://untrusted.invalid',
    )
  ).status,
  403,
);
const before = (await dashboard(manager)).stores[0].products.find(
  (p) => p.id === '10-coffee',
);
assert.equal(
  (
    await request(manager, '/retail/inventory/10-coffee/adjust', {
      delta: -(before.stock + 1),
      reason: 'Cannot go negative',
    })
  ).status,
  400,
);
// Set stock to one through the API, then race two purchases. Exactly one may succeed.
if (before.stock !== 1)
  assert.equal(
    (
      await request(manager, '/retail/inventory/10-coffee/adjust', {
        delta: 1 - before.stock,
        reason: 'Concurrency test setup',
      })
    ).status,
    201,
  );
try {
  const results = await Promise.all(
    [1, 2].map(() =>
      request(staff, '/retail/sales', {
        storeProductId: '10-coffee',
        quantity: 1,
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]);
  const created = await results.find((r) => r.status === 201).json();
  const after = (await dashboard(manager)).stores[0];
  assert.equal(after.products.find((p) => p.id === '10-coffee').stock, 0);
  const order = after.orders.find((o) => o.id === created.id);
  assert.equal(order.total, before.price);
  assert.equal(order.items[0].unitPrice, before.price);
  assert.equal(order.items[0].productNameSnapshot, 'Cold brew coffee');
  assert.equal(
    (
      await request(
        staff,
        `/orders/${created.id}`,
        { status: 'READY' },
        'PATCH',
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        staff,
        `/orders/${created.id}`,
        { status: 'PREPARING' },
        'PATCH',
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        staff,
        `/orders/${created.id}`,
        { status: 'READY' },
        'PATCH',
      )
    ).status,
    200,
  );
} finally {
  const current = (await dashboard(manager)).stores[0].products.find(
    (p) => p.id === '10-coffee',
  ).stock;
  if (current !== before.stock)
    assert.equal(
      (
        await request(manager, '/retail/inventory/10-coffee/adjust', {
          delta: before.stock - current,
          reason: 'Restore after concurrency check',
        })
      ).status,
      201,
    );
}
await request(manager, '/auth/logout');
assert.equal((await request(manager, '/retail', null, 'GET')).status, 401);
for (const cookie of [staff, hq, other]) await request(cookie, '/auth/logout');
console.info(
  'PASS: OAuth, revocation, role permissions, branch isolation, validation, CSRF origin, price snapshots, order lifecycle, and concurrent stock safety.',
);
