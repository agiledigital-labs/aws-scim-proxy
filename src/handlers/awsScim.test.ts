import {
  APIGatewayProxyEventHeaders,
  APIGatewayProxyEventV2,
} from 'aws-lambda';
/* eslint-disable @typescript-eslint/ban-ts-comment */
import axios, { Method } from 'axios';
import { handler } from './awsScim';

jest.mock('axios');

const createApiGatewayEvent = (
  method: Method,
  path: string,
  body: string | undefined,
  headers: APIGatewayProxyEventHeaders
): APIGatewayProxyEventV2 => ({
  requestContext: {
    // @ts-ignore
    http: { method, path: path.startsWith('/') ? path : `/${path}` },
  },
  body,
  headers,
});

describe('Proxy', () => {
  beforeAll(() => {
    // @ts-ignore
    axios.mockImplementation((url, { data, validateStatus }) =>
      validateStatus() && data?.error !== undefined
        ? { status: data.error, data: '', headers: {} }
        : { status: 200, data: '', headers: {} }
    );
  });

  afterAll(() => {
    jest.resetAllMocks();
  });

  it('should proxy a non group get request without modification', async () => {
    const event = createApiGatewayEvent(
      'GET',
      '/tenant/scim/v2/Members/someId',
      undefined,
      { Authorization: 'Bearer awsScimToken' }
    );

    await handler(event);

    expect(axios).toBeCalledWith(
      expect.stringContaining(event.requestContext.http.path),
      expect.objectContaining({
        data: event.body,
        headers: event.headers,
        method: event.requestContext.http.method.toLowerCase(),
      })
    );
  });

  it('should proxy a non group patch request without modification', async () => {
    const payload = {
      id: 'someId',
      externalId: '701984',
      userName: 'bjensen',
      name: {
        familyName: 'Jensen',
        givenName: 'Barbara',
      },
      emails: [{ value: 'bjensen@example.com', type: 'work', primary: true }],
      active: true,
    };

    const event = createApiGatewayEvent(
      'PATCH',
      '/tenant/scim/v2/Members/someId',
      JSON.stringify(payload),
      { Authorization: 'Bearer awsScimToken' }
    );

    await handler(event);

    expect(axios).toBeCalledWith(
      expect.stringContaining(event.requestContext.http.path),
      expect.objectContaining({
        data: payload,
        headers: event.headers,
        method: event.requestContext.http.method.toLowerCase(),
      })
    );
  });

  it('should proxy a group get request without modification', async () => {
    const event = createApiGatewayEvent(
      'GET',
      '/tenant/scim/v2/Groups/someId',
      undefined,
      { Authorization: 'Bearer awsScimToken' }
    );

    await handler(event);

    expect(axios).toBeCalledWith(
      expect.stringContaining(event.requestContext.http.path),
      expect.objectContaining({
        data: event.body,
        headers: event.headers,
        method: event.requestContext.http.method.toLowerCase(),
      })
    );
  });

  it('should proxy a group patch request without modification', async () => {
    const payload = {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [
        {
          op: 'replace',
          value: {
            id: 'someId',
            displayName: 'Test2',
          },
        },
      ],
    };

    const event = createApiGatewayEvent(
      'PATCH',
      '/tenant/scim/v2/Members/someId',
      JSON.stringify(payload),
      { Authorization: 'Bearer awsScimToken' }
    );

    await handler(event);

    expect(axios).toBeCalledWith(
      expect.stringContaining(event.requestContext.http.path),
      expect.objectContaining({
        data: payload,
        headers: event.headers,
        method: event.requestContext.http.method.toLowerCase(),
      })
    );
  });

  it('should proxy a group patch request with modification', async () => {
    const event = createApiGatewayEvent(
      'PATCH',
      '/tenant/scim/v2/Groups/someId',
      JSON.stringify({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          {
            op: 'replace',
            value: {
              id: 'someId',
              displayName: 'Test2',
              members: [{ value: 'userId1' }, { value: 'userId2' }],
            },
          },
        ],
      }),
      { Authorization: 'Bearer awsScimToken' }
    );

    await handler(event);

    expect(axios).toBeCalledWith(
      expect.stringContaining(event.requestContext.http.path),
      expect.objectContaining({
        data: {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [
            {
              op: 'replace',
              value: {
                id: 'someId',
                displayName: 'Test2',
              },
            },
            {
              op: 'replace',
              path: 'members',
              value: [{ value: 'userId1' }, { value: 'userId2' }],
            },
          ],
        },
        headers: event.headers,
        method: event.requestContext.http.method.toLowerCase(),
      })
    );
  });

  it('should proxy a group multi operation patch request with modification', async () => {
    const event = createApiGatewayEvent(
      'PATCH',
      '/tenant/scim/v2/Groups/someId',
      JSON.stringify({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          {
            op: 'replace',
            value: {
              id: 'someId',
              displayName: 'Test2',
              members: [{ value: 'userId1' }, { value: 'userId2' }],
            },
          },
          {
            op: 'replace',
            value: {
              id: 'someId',
              displayName: 'Test2',
            },
          },
        ],
      }),
      { Authorization: 'Bearer awsScimToken' }
    );

    await handler(event);

    expect(axios).toBeCalledWith(
      expect.stringContaining(event.requestContext.http.path),
      expect.objectContaining({
        data: {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [
            {
              op: 'replace',
              value: {
                id: 'someId',
                displayName: 'Test2',
              },
            },
            {
              op: 'replace',
              path: 'members',
              value: [{ value: 'userId1' }, { value: 'userId2' }],
            },
            {
              op: 'replace',
              value: {
                id: 'someId',
                displayName: 'Test2',
              },
            },
          ],
        },
        headers: event.headers,
        method: event.requestContext.http.method.toLowerCase(),
      })
    );
  });

  it('should handle a error response code from the aws scim endpoint', async () => {
    const event = createApiGatewayEvent(
      'GET',
      '/tenant/scim/v2/Members/someId',
      JSON.stringify({ error: 500 }),
      { Authorization: 'Bearer awsScimToken' }
    );

    await handler(event);

    expect(axios).toBeCalledWith(
      expect.stringContaining(event.requestContext.http.path),
      expect.objectContaining({
        headers: event.headers,
        method: event.requestContext.http.method.toLowerCase(),
      })
    );
  });

  it('should get a 405 response if a method which is not allowed by the proxy', async () => {
    const methods: ReadonlyArray<Method> = [
      'HEAD',
      // @ts-ignore - Not in Axios Spec
      'CONNECT',
      'OPTIONS',
      // @ts-ignore - Not in Axios Spec
      'TRACE',
      'PURGE',
      'LINK',
      'UNLINK',
    ];
    expect.assertions(methods.length);

    await Promise.all(
      methods.map(async (method) => {
        const response = await handler(
          createApiGatewayEvent(method, '', undefined, {})
        );

        expect(response.statusCode).toBe(405);
      })
    );
  });
});
