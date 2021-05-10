import {
  APIGatewayProxyEventHeaders,
  APIGatewayProxyEventV2,
} from 'aws-lambda';
/* eslint-disable @typescript-eslint/ban-ts-comment */
import axios, { Method } from 'axios';
import { URL } from 'url';
import { handler } from './awsScim';

jest.mock('axios');

const groupFixtures: Record<string, { members: ReadonlyArray<string> }> = {
  'a358d675-46ef-5b6c-85ac-d8bbb1410e73': {
    members: [
      '6215c125-4a6e-50b9-822a-86fe33f8172f',
      '1ee5e1d3-40dc-5ae1-aa51-aca7a832ddea',
      'edf32347-6d27-533f-a8ee-2898c657a184',
    ],
  },
  'a8a90f06-89fc-5633-9205-0f37699f0eb6': {
    members: [
      '98feceb2-1ea1-5a8a-b818-4eb19c32166a',
      '8a58f666-46a9-522b-b40a-484b09db59ec',
    ],
  },
  '88947dfb-06b4-5d8d-acea-1dc475524471': {
    members: [
      '98feceb2-1ea1-5a8a-b818-4eb19c32166a',
      'edf32347-6d27-533f-a8ee-2898c657a184',
    ],
  },
};

const userFixtures = {
  '6215c125-4a6e-50b9-822a-86fe33f8172f': {
    id: '6215c125-4a6e-50b9-822a-86fe33f8172f',
    userName: 'ccamolli0@blogspot.com',
    name: {
      givenName: 'Cleve',
      familyName: 'Camolli',
    },
    displayName: 'Cleve Camolli',
    emails: [
      {
        value: 'ccamolli0@blogspot.com',
        type: 'work',
        primary: true,
      },
    ],
    active: true,
  },
  '98feceb2-1ea1-5a8a-b818-4eb19c32166a': {
    id: '98feceb2-1ea1-5a8a-b818-4eb19c32166a',
    userName: 'pcondict0@tiny.cc',
    name: {
      givenName: 'Pamelina',
      familyName: 'Condict',
    },
    displayName: 'Pamelina Condict',
    emails: [
      {
        value: 'pcondict0@tiny.cc',
        type: 'work',
        primary: true,
      },
    ],
    active: true,
  },
  '1ee5e1d3-40dc-5ae1-aa51-aca7a832ddea': {
    id: '1ee5e1d3-40dc-5ae1-aa51-aca7a832ddea',
    userName: 'lwackley1@storify.com',
    name: {
      givenName: 'Lyndsie',
      familyName: 'Wackley',
    },
    displayName: 'Lyndsie Wackley',
    emails: [
      {
        value: 'lwackley1@storify.com',
        type: 'work',
        primary: true,
      },
    ],
    active: true,
  },
  '8a58f666-46a9-522b-b40a-484b09db59ec': {
    id: '8a58f666-46a9-522b-b40a-484b09db59ec',
    userName: 'lwackley1@storify.com',
    name: {
      givenName: 'Matilde',
      familyName: 'Paxforde',
    },
    displayName: 'Matilde Paxforde',
    emails: [
      {
        value: 'mpaxforde2@census.gov',
        type: 'work',
        primary: true,
      },
    ],
    active: true,
  },
  'edf32347-6d27-533f-a8ee-2898c657a184': {
    id: 'edf32347-6d27-533f-a8ee-2898c657a184',
    userName: 'odaniele3@paypal.com',
    name: {
      givenName: 'Osborne',
      familyName: 'Daniele',
    },
    displayName: 'Osborne Daniele',
    emails: [
      {
        value: 'odaniele3@paypal.com',
        type: 'work',
        primary: true,
      },
    ],
    active: true,
  },
};

const createApiGatewayEvent = (
  method: Method,
  path: string,
  body: string | Record<string, unknown> | undefined,
  headers: APIGatewayProxyEventHeaders
): APIGatewayProxyEventV2 => ({
  requestContext: {
    // @ts-ignore
    http: { method, path: path.startsWith('/') ? path : `/${path}` },
  },
  body:
    body !== undefined && typeof body === 'object'
      ? JSON.stringify(body)
      : body,
  headers,
});

describe('Proxy', () => {
  beforeAll(() => {
    // @ts-ignore
    axios.mockImplementation((url, { data, method, validateStatus }) => {
      if (data?.status !== undefined) {
        if (validateStatus(data?.status)) {
          return { status: data.status, data: '', headers: {} };
        }

        throw new Error(
          JSON.stringify({
            status: 500,
            data: { message: `Request failed: ${data?.status}` },
          })
        );
      }

      if (data?.forceException !== undefined) {
        throw new Error(
          JSON.stringify({
            status: 500,
            data: { message: data?.forceException },
          })
        );
      }

      const test = (url as string).match(
        /\/[A-z0-9-]+\/scim\/v2\/Groups\?filter=id eq "([A-z0-9-]+)" and members eq "([A-z0-9-]+)"/
      );

      if (test !== null && test.length === 3) {
        // @ts-ignore
        const [, groupId, memberId]: [never, string, string] = test;

        return {
          status: 200,
          headers: {},
          data: {
            Resources: groupFixtures[groupId]?.members.includes(memberId)
              ? [{ id: groupId }]
              : [],
          },
        };
      }

      if (method === 'get' && (url as string).endsWith('/Users')) {
        return {
          status: 200,
          headers: {},
          data: { Resources: Object.values(userFixtures) },
        };
      }

      if (method === 'patch') {
        return { status: 204, headers: {}, data: undefined };
      }

      return { status: 200, data: '', headers: {} };
    });
  });

  afterAll(() => {
    jest.resetAllMocks();
  });

  it('should not transform a get request', async () => {
    const event = createApiGatewayEvent('get', 'test', undefined, {});

    await handler(event);

    expect(axios).toHaveBeenLastCalledWith(
      expect.stringContaining(event.requestContext.http.path),
      expect.objectContaining({
        method: event.requestContext.http.method.toLowerCase(),
      })
    );
  });

  it('should not transform a post request', async () => {
    const payload = {
      externalId: '701984',
      userName: 'bjensen',
      name: {
        familyName: 'Jensen',
        givenName: 'Barbara',
      },
      displayName: 'Babs Jensen',
      emails: [
        {
          value: 'bjensen@example.com',
          type: 'work',
          primary: true,
        },
      ],
      active: true,
    };

    const event = createApiGatewayEvent('post', 'test', payload, {});

    await handler(event);

    expect(axios).toHaveBeenLastCalledWith(
      expect.stringContaining(event.requestContext.http.path),
      expect.objectContaining({
        data: payload,
        method: event.requestContext.http.method.toLowerCase(),
      })
    );
  });

  it('should transform a put request to patch operations', async () => {
    const payload = {
      id: 'some-id',
      schemas: ['some-schema'],
      userName: 'bjensen',
      displayName: 'Babs Jensen',
      active: true,
      emails: [
        {
          value: 'bjensen@example.com',
          primary: true,
          type: 'work',
        },
        {
          value: 'babs123@example.com',
          primary: false,
          type: 'personal',
        },
      ],
    };

    const event = createApiGatewayEvent('put', 'test', payload, {});

    await handler(event);

    expect(axios).toHaveBeenLastCalledWith(
      expect.stringContaining(event.requestContext.http.path),
      expect.objectContaining({
        method: 'patch',
        data: {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [
            { op: 'replace', path: 'userName', value: 'bjensen' },
            { op: 'replace', path: 'displayName', value: 'Babs Jensen' },
            { op: 'replace', path: 'active', value: true },
            {
              op: 'replace',
              path: 'emails',
              value: [
                {
                  value: 'bjensen@example.com',
                  primary: true,
                  type: 'work',
                },
                {
                  value: 'babs123@example.com',
                  primary: false,
                  type: 'personal',
                },
              ],
            },
          ],
        },
      })
    );
  });

  it('should transform a patch request to patch operations', async () => {
    const payload = {
      schemas: ['some-schema'],
      Operations: [
        {
          op: 'replace',
          value: {
            id: 'some-id',
            schemas: ['some-schema'],
            userName: 'bjensen',
            displayName: 'Babs Jensen',
            active: true,
            emails: [
              {
                value: 'bjensen@example.com',
                primary: true,
                type: 'work',
              },
              {
                value: 'babs123@example.com',
                primary: false,
                type: 'personal',
              },
            ],
          },
        },
      ],
    };

    const event = createApiGatewayEvent('patch', 'test', payload, {});

    await handler(event);

    expect(axios).toHaveBeenLastCalledWith(
      expect.stringContaining(event.requestContext.http.path),
      expect.objectContaining({
        method: 'patch',
        data: {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [
            { op: 'replace', path: 'userName', value: 'bjensen' },
            { op: 'replace', path: 'displayName', value: 'Babs Jensen' },
            { op: 'replace', path: 'active', value: true },
            {
              op: 'replace',
              path: 'emails',
              value: [
                {
                  value: 'bjensen@example.com',
                  primary: true,
                  type: 'work',
                },
                {
                  value: 'babs123@example.com',
                  primary: false,
                  type: 'personal',
                },
              ],
            },
          ],
        },
      })
    );
  });

  it('should have operations for create and delete of members from groups in patch request', async () => {
    const payload = {
      id: 'some-id',
      schemas: ['some-schema'],
      Operations: [
        {
          op: 'replace',
          value: {
            members: [
              { value: '8a58f666-46a9-522b-b40a-484b09db59ec' },
              { value: 'edf32347-6d27-533f-a8ee-2898c657a184' },
              { value: '1ee5e1d3-40dc-5ae1-aa51-aca7a832ddea' },
            ],
          },
        },
      ],
    };

    const event = createApiGatewayEvent(
      'patch',
      '/test/scim/v2/Groups/a8a90f06-89fc-5633-9205-0f37699f0eb6',
      payload,
      {}
    );

    await handler(event);

    expect(axios).toHaveBeenLastCalledWith(
      expect.stringContaining(event.requestContext.http.path),
      expect.objectContaining({
        method: 'patch',
        data: expect.objectContaining({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [
            {
              op: 'add',
              path: 'members',
              value: [
                { value: 'edf32347-6d27-533f-a8ee-2898c657a184' },
                { value: '1ee5e1d3-40dc-5ae1-aa51-aca7a832ddea' },
              ],
            },
            {
              op: 'remove',
              path: 'members',
              value: [{ value: '98feceb2-1ea1-5a8a-b818-4eb19c32166a' }],
            },
          ],
        }),
      })
    );
  });

  it('should modify headers for upstream server', async () => {
    const event = createApiGatewayEvent('get', 'test', undefined, {
      'content-length': '100',
      host: 'https://api-gateway-url',
      authorization: 'Bearer aCoolToken',
    });

    await handler(event);

    expect(axios).toHaveBeenLastCalledWith(
      expect.stringContaining(event.requestContext.http.path),
      expect.objectContaining({
        headers: {
          authorization: event.headers.authorization,
          // @ts-ignore
          host: new URL(process.env.PROXY_URL).hostname,
        },
      })
    );
  });

  it('should respond with downstream statuses', async () => {
    const statusesCodes = [
      200,
      201,
      202,
      203,
      205,
      206,
      400,
      401,
      403,
      404,
      405,
      406,
      408,
      409,
      410,
      413,
      429,
      500,
      501,
      502,
      503,
      504,
    ];

    expect.assertions(statusesCodes.length);

    await Promise.all(
      statusesCodes.map(async (code) => {
        const response = await handler(
          createApiGatewayEvent('get', 'test', { status: code }, {})
        );
        expect(response.statusCode).toBe(code);
      })
    );
  });

  it('should handle axios exception', async () => {
    const event = createApiGatewayEvent(
      'get',
      'test',
      { forceException: 'forced exception' },
      {}
    );

    const response = await handler(event);
    expect(response.statusCode).toBe(500);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(JSON.parse(response.body!).message).toBe(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      JSON.parse(event.body!).forceException
    );
  });

  it('should handle malformed url', async () => {
    const event = createApiGatewayEvent(
      'patch',
      '',
      {
        id: 'some-id',
        schemas: ['some-schema'],
        Operations: [
          {
            op: 'replace',
            value: {
              members: [{ value: '8a58f666-46a9-522b-b40a-484b09db59ec' }],
            },
          },
        ],
      },
      {}
    );

    const response = await handler(event);
    expect(response.statusCode).toBe(200);
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
