import Stripe from 'stripe';
import { adminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !whsec) return new Response('Stripe not configured', { status: 500 });

  const stripe = new Stripe(secret);
  const sig = req.headers.get('stripe-signature') || '';
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, whsec);
  } catch (e: any) {
    return new Response('Bad signature: ' + (e?.message || ''), { status: 400 });
  }

  const admin = adminClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.customer) {
          await admin
            .from('profiles')
            .update({ plan: 'pro' })
            .eq('stripe_customer_id', s.customer as string);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const active = sub.status === 'active' || sub.status === 'trialing';
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        await admin
          .from('profiles')
          .update({ plan: active ? 'pro' : 'free', current_period_end: periodEnd })
          .eq('stripe_customer_id', sub.customer as string);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await admin
          .from('profiles')
          .update({ plan: 'free' })
          .eq('stripe_customer_id', sub.customer as string);
        break;
      }
    }
  } catch (e: any) {
    return new Response('Handler error: ' + (e?.message || ''), { status: 500 });
  }

  return new Response('ok');
}
