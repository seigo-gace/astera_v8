'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const SQLiteStore = require('../src/store/sqlite-store');
const SubscriptionSync = require('../src/billing/subscription-sync');

async function withStore(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astera-billing-'));
  const store = new SQLiteStore(path.join(dir, 'test.db'));
  try {
    return await fn(store);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('SubscriptionSync handles Stripe webhook idempotently by event id', async () => {
  await withStore(async (store) => {
    const sync = new SubscriptionSync(store, {});
    const tenant = store.createTenant({ apiKeyHash: 'hash', keyPrefix: 'kg_test', plan: 'free', status: 'active' });
    const event = {
      id: 'evt_idempotent',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: tenant.id, customer: 'cus_1', subscription: 'sub_1', metadata: {} } }
    };
    const first = await sync.handleEvent(event);
    const second = await sync.handleEvent(event);
    const updated = store.getTenantById(tenant.id);

    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(updated.plan, 'pro');
    assert.equal(updated.stripe_subscription_id, 'sub_1');
  });
});

test('SubscriptionSync maps subscription.deleted back to tenant by subscription id', async () => {
  await withStore(async (store) => {
    const sync = new SubscriptionSync(store, {});
    const tenant = store.createTenant({ apiKeyHash: 'hash2', keyPrefix: 'kg_test2', plan: 'pro', status: 'active' });
    store.updateTenant(tenant.id, { stripe_subscription_id: 'sub_delete_me', stripe_customer_id: 'cus_2' });

    const result = await sync.handleEvent({
      id: 'evt_delete',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_delete_me' } }
    });
    const updated = store.getTenantById(tenant.id);

    assert.equal(result.handled, true);
    assert.equal(result.canceled, true);
    assert.equal(updated.plan, 'free');
    assert.equal(updated.status, 'canceled');
  });
});
