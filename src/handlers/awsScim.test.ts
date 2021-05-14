/* eslint-disable @typescript-eslint/ban-ts-comment */
import {
  APIGatewayProxyEventHeaders,
  APIGatewayProxyEventV2,
} from 'aws-lambda';
import { Method } from 'axios';
import { sendRequest, AllowMethods } from '../services/scimFetch';

import { handler } from './awsScim';

jest.mock('../services/scimFetch', () => ({
  sendRequest: jest.fn().mockImplementation((method: AllowMethods) => {
    if (method === 'patch') {
      return { status: 204 };
    }

    return { status: 200 };
  }),
  allowedMethods: ['get', 'post', 'patch', 'put', 'delete'],
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
  it('should handle a undefined body', async () => {
    const response = await handler(
      createApiGatewayEvent('get', '/', undefined, {})
    );

    expect(response.statusCode).toBe(200);
    expect(sendRequest).toHaveBeenCalledWith('get', {}, undefined, '/');
  });

  it('should handle a defined body', async () => {
    const payload = {
      hello: 'world',
    };

    const response = await handler(
      createApiGatewayEvent('patch', '/', payload, {})
    );

    expect(response.statusCode).toBe(200);
    expect(sendRequest).toHaveBeenCalledWith('patch', {}, payload, '/');
  });

  it('should errors from data transformation', async () => {
    const payload = {
      error: 500,
    };

    await handler(createApiGatewayEvent('get', '/', payload, {})).catch((e) =>
      expect(e).rejects.toEqual({ status: payload.error, data: payload })
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
