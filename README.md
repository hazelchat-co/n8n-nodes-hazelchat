# n8n-nodes-hazelchat

Hazelchat nodes for [n8n](https://n8n.io). [Hazelchat](https://hazelchat.co) is a website agent that answers visitors from a business's approved content and collects their enquiries. These nodes bring each new enquiry into an n8n workflow.

- **Hazelchat Trigger** starts a workflow when a visitor leaves an enquiry.
- **Hazelchat**, with Enquiry → Get Many, reads the latest enquiries. Use it for sample data, or with n8n's Schedule Trigger when your n8n cannot be reached from the internet.

The nodes only read enquiries. Apart from the trigger's own subscription, they never create, change or delete anything in Hazelchat.

## Requirements

- A Hazelchat workspace on Business or Scale, with visitor details switched on in Settings → Data & privacy. Enquiry capture must be running.
- An n8n instance. For the trigger, Hazelchat must be able to reach it at a public HTTPS address (n8n Cloud, or a self-hosted n8n behind HTTPS on the standard port). An n8n that the internet cannot reach can use Get Many on a schedule instead.

## Installation

Follow n8n's [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/). On a self-hosted instance, go to Settings → Community nodes and install `n8n-nodes-hazelchat`.

## Credentials

1. In Hazelchat, open Settings and find the card for your tools. Create an API key and copy it. Hazelchat shows it once.
2. In n8n, create a **Hazelchat API** credential and paste the key. n8n checks it against Hazelchat and shows a success message.

The key starts with `hzk_` and can only read enquiries. Revoke it in Hazelchat Settings at any time; that also removes its subscriptions.

## Hazelchat Trigger

Add **Hazelchat Trigger** to a workflow, choose the credential and publish the workflow.

- **On publish**, the node subscribes the workflow's production webhook URL in Hazelchat. "Listen for test event" subscribes the test URL for the length of the test.
- **On unpublish**, it removes the subscription.
- **Each new enquiry** arrives as one item with these fields: `id`, `created_at`, `name`, `email`, `message`, `website`, `last_question`, `answered` and `enquiry_url`. Where the visitor's browser reported them, the item also has `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `ad_click_network`, `referrer_host`, `chat_started_on` and `chat_opened_via`. See the [field reference](https://hazelchat.co/docs/api/#item).
- **Signatures:** Hazelchat signs every delivery with a secret that only this subscription knows. The node checks the signature and the time it was sent before it starts the workflow. A request that was changed, forged or sent more than five minutes ago gets a 401 and starts nothing.
- Subscribing sends no older enquiries. Use Get Many for those.

Visitor text is untrusted plain text. Escape it before you put it into HTML or email templates.

## Hazelchat (Get Many)

**Resource:** Enquiry. **Operation:** Get Many. **Limit:** 1 to 100 (default 50).

Returns enquiries from the last 30 days, newest first, with the same fields as the trigger. Owner tests and previews are not included.

## Example workflows

These show the shape of a workflow. They are not tested integrations with the tools they mention.

1. **New enquiry → your CRM or chat.** Hazelchat Trigger, then the node for your CRM, spreadsheet or team chat. Map `name`, `email` and `message`, and keep `enquiry_url` as a link back to Hazelchat.
2. **Behind a firewall.** Schedule Trigger (every 15 minutes) → Hazelchat, Get Many (Limit 20) → Remove Duplicates on `id` (across executions) → your destination.
3. **Look at recent enquiries.** Manual Trigger → Hazelchat, Get Many. The file [`examples/get-many.json`](examples/get-many.json) is this workflow.

## Privacy

Each enquiry goes to your n8n: n8n Cloud (n8n GmbH, hosted in the EU) or your own server. From there it goes to the tools in your workflow. Deleting an enquiry in Hazelchat cannot remove copies already in n8n's execution history or in those tools. Hazelchat's [API documentation](https://hazelchat.co/docs/api/) describes what is sent.

## Compatibility

Built with `@n8n/node-cli` 0.51.4 (strict lint). Tested locally against n8n 2.42.6 on Node.js 24.

## Resources

- [Hazelchat API reference](https://hazelchat.co/docs/api/)
- [n8n community nodes](https://docs.n8n.io/integrations/#community-nodes)

## Licence

[MIT](LICENSE.md)
