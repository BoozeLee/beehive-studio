# Commercial Use

Mixhive Pro may be available under one or more commercial models:

- Sponsored open source
- Paid support
- Commercial license
- Hosted service
- Marketplace app/action
- Direct Stripe checkout

## Current Status

Commercial terms are not final until a pricing page, license, support policy,
and legal review are complete.

## Interested Customers

Contact: sales@mixhive.dev

## Internal Stripe Workflow

Agents must not use raw Stripe keys. Use:

\`\`\`bash
beehive-stripe account
beehive-stripe products
\`\`\`

Prepare product and price payloads for approval before creating live Stripe
objects.
