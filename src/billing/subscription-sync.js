'use strict';

function paidPlan(value) {
  return value === 'business' ? 'business' : 'pro';
}

class SubscriptionSync {
  constructor(store, stripe) {
    this.store = store;
    this.stripe = stripe;
  }

  async handleEvent(event) {
    const eventId = String(event?.id || '').trim();
    const type = event?.type || 'stripe.unknown';
    if (!eventId) {
      const error = new Error('Stripe event id is required');
      error.status = 400;
      throw error;
    }

    const gate = this.store.beginProcessedEvent({ eventId, type });
    if (!gate.firstTime) {
      return {
        handled: true,
        duplicate: true,
        eventId,
        previous_status: gate.event?.status || gate.reason || 'unknown'
      };
    }

    try {
      this.store.recordEvent({ type, payload: event });
      const result = await this._applyEvent(event);
      this.store.finishProcessedEvent({
        eventId,
        status: 'processed',
        tenantId: result.tenantId || null,
        result
      });
      return { ...result, eventId, duplicate: false };
    } catch (error) {
      this.store.finishProcessedEvent({
        eventId,
        status: 'failed',
        tenantId: null,
        result: { handled: false },
        errorMessage: error.message
      });
      throw error;
    }
  }

  async _applyEvent(event) {
    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object || {};
      const tenantId = session.metadata?.tenant_id || session.client_reference_id;
      const tenant = tenantId ? this.store.getTenantById(tenantId) : null;
      if (tenant) {
        this.store.updateTenant(tenant.id, {
          plan: paidPlan(session.metadata?.plan),
          status: 'active',
          stripe_customer_id: session.customer || null,
          stripe_subscription_id: session.subscription || null
        });
        return { handled: true, tenantId: tenant.id };
      }
      this.store.recordEvent({ type: 'stripe.checkout.completed.needs_review', payload: session });
      return { handled: true, review: true };
    }

    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const subscription = event.data?.object || {};
      const tenantId = subscription.metadata?.tenant_id;
      const tenant = (tenantId && this.store.getTenantById(tenantId))
        || this.store.findTenantByStripeSubscriptionId(subscription.id)
        || this.store.findTenantByStripeCustomerId(subscription.customer);
      if (!tenant) {
        this.store.recordEvent({ type: 'stripe.subscription.updated.needs_review', payload: subscription });
        return { handled: true, review: true };
      }

      const paid = ['active', 'trialing'].includes(subscription.status);
      const blocked = ['past_due', 'unpaid', 'paused'].includes(subscription.status);
      this.store.updateTenant(tenant.id, {
        plan: paid ? paidPlan(subscription.metadata?.plan) : 'free',
        status: blocked ? 'past_due' : 'active',
        stripe_customer_id: subscription.customer || tenant.stripe_customer_id,
        stripe_subscription_id: subscription.id || tenant.stripe_subscription_id
      });
      return { handled: true, tenantId: tenant.id, subscriptionStatus: subscription.status || 'unknown' };
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data?.object || {};
      const tenant = this.store.findTenantByStripeSubscriptionId(subscription.id);
      if (tenant) {
        this.store.updateTenant(tenant.id, {
          plan: 'free',
          status: 'active',
          stripe_subscription_id: null
        });
        return { handled: true, tenantId: tenant.id, canceled: true };
      }
      this.store.recordEvent({ type: 'stripe.subscription.deleted.needs_review', payload: subscription });
      return { handled: true, review: true };
    }

    return { handled: false };
  }
}

module.exports = SubscriptionSync;
