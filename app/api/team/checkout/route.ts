import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST() {
  const secret = process.env.STRIPE_SECRET_KEY;
  const price = process.env.STRIPE_TEAM_PRICE_ID;
  if (!secret || !price) {
    return NextResponse.json({ error: 'Team billing is not configured on the server.' }, { status: 500 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const admin = adminClient();
  const { data: team } = await admin
    .from('teams')
    .select('id, name, stripe_customer_id')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!team) return NextResponse.json({ error: 'Create a team first.' }, { status: 400 });

  const stripe = new Stripe(secret);

  let customerId = team.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email || undefined,
      name: team.name,
      metadata: { team_id: team.id, owner_id: user.id },
    });
    customerId = customer.id;
    await admin.from('teams').update({ stripe_customer_id: customerId }).eq('id', team.id);
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://manualmind-six.vercel.app';
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: team.id,
    metadata: { team_id: team.id },
    subscription_data: { metadata: { team_id: team.id } },
    success_url: origin + '/team?upgraded=1',
    cancel_url: origin + '/team',
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
