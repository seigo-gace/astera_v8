'use strict';

class SubscriptionSync {
  constructor(store, stripe) {
    this.store = store;
    this.stripe = stripe;
  }

  async handleEvent(event) {
    const eventId = String(event?.id || '').trim();
    const type = event?.type || 'stripe.unknown';

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
      if (tenantId) {
        this.store.updateTenant(tenantId, {
          plan: 'pro',
          status: 'active',
          stripe_customer_id: session.customer || null,
          stripe_subscription_id: session.subscription || null
        });
      }
      return { handled: true, tenantId };
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data?.object || {};
      const tenant = this.store.findTenantByStripeSubscriptionId(subscription.id);
      if (tenant) {
        this.store.updateTenant(tenant.id, {
          plan: 'free',
          status: 'canceled',
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
