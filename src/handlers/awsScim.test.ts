/* eslint-disable @typescript-eslint/ban-ts-comment */
import {
  APIGatewayProxyEventHeaders,
  APIGatewayProxyEventV2,
} from 'aws-lambda';
import { Method } from 'axios';
import { modifyBody } from '../services/scimTransformation';
import {
  sendRequest,
  AllowMethods,
  fetchUsersInGroup,
} from '../services/scimFetch';
import { handler } from './awsScim';
import { mockFunctionHolder } from '../../.jest/setup.test';

jest.mock('../services/scimFetch', () => ({
  sendRequest: jest.fn().mockImplementation((method: AllowMethods) => {
    if (method === 'patch') {
      return { status: 204 };
    }

    return { status: 200 };
  }),
  allowedMethods: ['get', 'post', 'patch', 'put', 'delete'],
  fetchAllUsers: jest.fn(),
  fetchUserGroupRelationship: jest.fn(),
  fetchUsersInGroup: () => mockFunctionHolder,
}));

jest.mock('../services/scimTransformation', () => ({
  modifyBody: jest
    .fn()
    .mockImplementation(async (method, headers, path, body) => {
      if (body.error !== undefined) {
        // eslint-disable-next-line prefer-promise-reject-errors
        return Promise.reject({ status: body.error, data: body });
      }
      return {
        data: body,
        method,
        path,
        headers,
      };
    }),
}));

// Remove noisy logging from Jest output
console.trace = jest.fn();

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

describe('AWS Scim Handler', () => {
  afterEach(() => {
    // @ts-ignore
    modifyBody.mockClear();
  });

  it('should handle a undefined body', async () => {
    const response = await handler(
      createApiGatewayEvent(
        'get',
        '/tenant-id/scim/v2/Groups/group-id',
        undefined,
        {}
      )
    );

    expect(response.statusCode).toBe(200);
    expect(sendRequest).toHaveBeenCalledWith(
      'get',
      {},
      undefined,
      '/tenant-id/scim/v2/Groups/group-id'
    );
  });

  it('should handle a defined body', async () => {
    const payload = {
      hello: 'world',
    };

    const response = await handler(
      createApiGatewayEvent(
        'patch',
        '/tenant-id/scim/v2/Users/user-id',
        payload,
        {}
      )
    );

    expect(response.statusCode).toBe(200);
    expect(sendRequest).toHaveBeenCalledWith(
      'patch',
      {},
      payload,
      '/tenant-id/scim/v2/Users/user-id'
    );
  });

  it('should errors from data transformation', async () => {
    const payload = {
      error: 500,
    };

    await handler(createApiGatewayEvent('get', '/', payload, {})).catch((e) =>
      expect(e).rejects.toEqual({ status: payload.error, data: payload })
    );
  });

  it('should create fetchUserGroups function', async () => {
    const tests = [
      ['/tenant-id/scim/v2/Users/user-id', undefined],
      // @ts-ignore
      ['/tenant-id/scim/v2/Groups/group-id', fetchUsersInGroup()],
      ['/invalid', undefined],
    ] as const;

    expect.assertions(tests.length);

    await Promise.all(
      tests.map(async ([path, result]) => {
        await handler(createApiGatewayEvent('get', path, {}, {}));
        expect(modifyBody).toHaveBeenCalledWith('get', {}, path, {}, result);
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
