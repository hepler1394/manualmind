import Stripe from 'stripe';
import { adminClient } from '@/lib/supabase/admin';
import { setTeamMembersPlan } from '@/lib/team';

export const runtime = 'nodejs';

// Separate Stripe webhook endpoint for team subscriptions. Only acts on events
// carrying a team_id in metadata; individual Pro subs are handled elsewhere.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const whsec = process.env.STRIPE_TEAM_WEBHOOK_SECRET;
  if (!secret || !whsec) return new Response('Team billing not configured', { status: 500 });

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
        const teamId = s.metadata?.team_id;
        if (teamId) {
          await admin
            .from('teams')
            .update({
              status: 'active',
              stripe_subscription_id: (s.subscription as string) || null,
            })
            .eq('id', teamId);
          await setTeamMembersPlan(admin, teamId, 'pro');
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const teamId = sub.metadata?.team_id;
        if (teamId) {
          const active = sub.status === 'active' || sub.status === 'trialing';
          await admin
            .from('teams')
            .update({
              status: active ? 'active' : 'inactive',
              stripe_subscription_id: sub.id,
              current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            })
            .eq('id', teamId);
          await setTeamMembersPlan(admin, teamId, active ? 'pro' : 'free');
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const teamId = sub.metadata?.team_id;
        if (teamId) {
          await admin.from('teams').update({ status: 'canceled' }).eq('id', teamId);
          await setTeamMembersPlan(admin, teamId, 'free');
        }
        break;
      }
    }
  } catch (e: any) {
    return new Response('Handler error: ' + (e?.message || ''), { status: 500 });
  }

  return new Response('ok');
}
