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
    assert.equal(updated.status, 'active');
  });
});

test('SubscriptionSync applies subscription.updated and keeps paid access active', async () => {
  await withStore(async (store) => {
    const sync = new SubscriptionSync(store, {});
    const tenant = store.createTenant({ apiKeyHash: 'hash3', keyPrefix: 'kg_test3', plan: 'free', status: 'active' });
    store.updateTenant(tenant.id, { stripe_customer_id: 'cus_3' });

    const result = await sync.handleEvent({
      id: 'evt_update',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_3', customer: 'cus_3', status: 'active', metadata: {} } }
    });
    const updated = store.getTenantById(tenant.id);

    assert.equal(result.handled, true);
    assert.equal(updated.plan, 'pro');
    assert.equal(updated.status, 'active');
    assert.equal(updated.stripe_subscription_id, 'sub_3');
  });
});

test('SubscriptionSync rejects events without an id', async () => {
  await withStore(async (store) => {
    const sync = new SubscriptionSync(store, {});
    await assert.rejects(() => sync.handleEvent({ type: 'checkout.session.completed' }), /event id is required/);
  });
});

test('SubscriptionSync preserves a business plan from Stripe metadata', async () => {
  await withStore(async (store) => {
    const sync = new SubscriptionSync(store, {});
    const tenant = store.createTenant({ apiKeyHash: 'hash4', keyPrefix: 'kg_test4', plan: 'free', status: 'active' });
    const result = await sync.handleEvent({
      id: 'evt_business',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: tenant.id, metadata: { plan: 'business' }, subscription: 'sub_business' } }
    });
    const updated = store.getTenantById(tenant.id);
    assert.equal(result.handled, true);
    assert.equal(updated.plan, 'business');
  });
});
