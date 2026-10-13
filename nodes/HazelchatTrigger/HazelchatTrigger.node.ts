import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IHookFunctions,
	type IHttpRequestMethods,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
	type JsonObject,
} from 'n8n-workflow';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from './signature';

type Answer = { statusCode: number; body: unknown };

// Talks to Hazelchat's subscription routes only (/api/v1/hooks): creating,
// checking and removing this workflow's own subscription.
async function hooksRequest(
	this: IHookFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
): Promise<Answer> {
	const credentials = await this.getCredentials('hazelchatApi');
	const answer = (await this.helpers.httpRequestWithAuthentication.call(this, 'hazelchatApi', {
		method,
		baseURL: String(credentials.baseUrl),
		url: path,
		body,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	})) as Answer;
	return answer;
}

function refused(this: IHookFunctions, answer: Answer): NodeApiError {
	const message =
		typeof answer.body === 'object' &&
		answer.body !== null &&
		typeof (answer.body as IDataObject).error === 'string'
			? String((answer.body as IDataObject).error)
			: 'Hazelchat refused the request.';
	return new NodeApiError(this.getNode(), { message } as JsonObject, {
		message,
		httpCode: String(answer.statusCode),
	});
}

export class HazelchatTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Hazelchat Trigger',
		name: 'hazelchatTrigger',
		icon: { light: 'file:../../icons/hazelchat.svg', dark: 'file:../../icons/hazelchat.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: 'New enquiry',
		description: 'Starts the workflow when a visitor leaves an enquiry with your Hazelchat website agent',
		defaults: {
			name: 'Hazelchat Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'hazelchatApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'Starts for each new enquiry. In Hazelchat, visitor details must be on and the workspace on Business or Scale.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (typeof data.hookId !== 'string' || typeof data.secret !== 'string') return false;
				const answer = await hooksRequest.call(
					this,
					'GET',
					`/api/v1/hooks/${encodeURIComponent(data.hookId)}`,
				);
				if (answer.statusCode === 200) return true;
				if (answer.statusCode === 404) {
					delete data.hookId;
					delete data.secret;
					return false;
				}
				throw refused.call(this, answer);
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				const answer = await hooksRequest.call(this, 'POST', '/api/v1/hooks', {
					target_url: this.getNodeWebhookUrl('default'),
					platform: 'n8n',
				});
				const body = answer.body as IDataObject | undefined;
				if (answer.statusCode !== 201) throw refused.call(this, answer);
				if (typeof body?.id !== 'string' || typeof body.secret !== 'string') {
					throw new NodeOperationError(this.getNode(), 'Hazelchat did not return a subscription.');
				}
				// Hazelchat shows the signing secret once; it lives in this
				// workflow's static data next to the subscription id.
				data.hookId = body.id;
				data.secret = body.secret;
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (typeof data.hookId === 'string') {
					const answer = await hooksRequest.call(
						this,
						'DELETE',
						`/api/v1/hooks/${encodeURIComponent(data.hookId)}`,
					);
					// 404: already gone in Hazelchat (key revoked, removed there).
					if (answer.statusCode !== 200 && answer.statusCode !== 404) {
						throw refused.call(this, answer);
					}
				}
				delete data.hookId;
				delete data.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const request = this.getRequestObject();
		if (request.rawBody === undefined && typeof request.readRawBody === 'function') {
			await request.readRawBody();
		}
		const data = this.getWorkflowStaticData('node');
		const verdict = verifySignature({
			secret: data.secret,
			rawBody: request.rawBody,
			timestamp: request.headers[TIMESTAMP_HEADER],
			signature: request.headers[SIGNATURE_HEADER],
			now: Date.now(),
		});
		if (!verdict.ok) {
			// Not from Hazelchat, changed on the way, or too old: nothing runs.
			this.getResponseObject().status(401).json({ error: 'Signature check failed.' });
			return { noWebhookResponse: true };
		}
		return {
			workflowData: [this.helpers.returnJsonArray(this.getBodyData())],
		};
	}
}
