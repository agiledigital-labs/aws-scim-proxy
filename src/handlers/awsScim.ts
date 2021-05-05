import type {
  APIGatewayProxyEventHeaders,
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import axios, { AxiosResponse } from 'axios';
import { cleanEnv, url } from 'envalid';
import { URL } from 'url';

type SafeAxiosResponse<T> = Omit<AxiosResponse<T>, 'headers'> & {
  headers: Record<string, string | number | boolean> | undefined;
};

const allowedMethods = ['get', 'post', 'patch', 'put', 'delete'] as const;
type AllowMethods = typeof allowedMethods[number];

type ScimPatchGroupOperation = {
  schemas: ReadonlyArray<string>;
  Operations: ReadonlyArray<{
    op: 'add' | 'replace' | 'remove';
    value: {
      members?: [{ value: string }];
    };
  }>;
};

type ScimPatchOperation = {
  schemas: ReadonlyArray<string>;
  Operations: ReadonlyArray<{
    op: 'add' | 'replace' | 'remove';
    path?: string;
    value: unknown;
  }>;
};

type ScimPutOperation = {
  id: string;
  schemas: string[];
} & Record<string, string | number | ReadonlyArray<{ value: string | number }>>;

type GroupOperations = ScimPutOperation | ScimPatchOperation;

type MetaPayload<T = unknown> = {
  data: T;
  headers: APIGatewayProxyEventHeaders;
  method: AllowMethods;
  path: string;
};

const env = cleanEnv(process.env, {
  PROXY_URL: url(),
});

const sendRequest = async (
  method: AllowMethods,
  headers: APIGatewayProxyEventHeaders,
  data: unknown,
  path: string
): Promise<SafeAxiosResponse<unknown>> => {
  console.info(
    `Sending request ${method.toUpperCase()} ${path} using ${JSON.stringify(
      data
    )}`
  );

  const response = await axios(`${env.PROXY_URL}${path}`, {
    method,
    headers: { ...headers, host: new URL(env.PROXY_URL).hostname },
    data,
  });

  console.info(`Response ${response.status} ${JSON.stringify(response.data)}`);

  return response;
};

// const fetchCurrentMembersForGroup = async (
//   headers: APIGatewayProxyEventHeaders,
//   path: string
// ) => sendRequest('get', headers, undefined, path);

// const constructCreateAndDeleteMembersOperations = async (members: ReadonlyArray<{value: string}>) => {

// }

/**
 * Moves the members data out of the group operation to a separate members
 * operation
 *
 * @param body payload from http event
 * @returns updated payload for proxy event
 */
const moveMemberPatch = (
  method: AllowMethods,
  headers: APIGatewayProxyEventHeaders,
  path: string,
  body: ScimPatchGroupOperation
): MetaPayload<ScimPatchOperation> => ({
  method,
  headers,
  path,
  data: {
    ...body,
    Operations: body.Operations.reduce<ScimPatchOperation['Operations']>(
      (acc, current) =>
        current.value.members !== undefined
          ? [
              ...acc,
              { ...current, value: { ...current.value, members: undefined } },
              { op: 'replace', path: 'members', value: current.value.members },
            ]
          : [...acc, current],
      []
    ),
  },
});

const splitPutToPatch = (
  headers: APIGatewayProxyEventHeaders,
  path: string,
  body: ScimPutOperation
): MetaPayload<ScimPatchOperation> => {
  const rest: Record<string, unknown> & {
    schemas: undefined;
    id: undefined;
  } = { ...body, id: undefined, schemas: undefined };

  const operations = Object.entries(rest)
    .map(([key, value]): ScimPatchOperation['Operations'][number] => ({
      op: 'replace',
      path: key,
      value,
    }))
    .filter((operation) => operation.value !== undefined);

  return {
    data: {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: operations,
    },
    headers,
    method: 'patch',
    path,
  };
};

const patchBody = (
  method: AllowMethods,
  headers: APIGatewayProxyEventHeaders,
  path: string,
  body: unknown
): ReadonlyArray<MetaPayload<GroupOperations>> => {
  switch (method) {
    case 'patch':
      return [
        moveMemberPatch(method, headers, path, body as ScimPatchGroupOperation),
      ];
    case 'put':
      return [splitPutToPatch(headers, path, body as ScimPutOperation)];
    default:
      return [{ data: body as GroupOperations, headers, path, method }];
  }
};

/**
 * Handles the incoming api gateway event and proxies it to AWS SCIM endpoint.
 * Will request body modifications if it detects invalid payloads being sent to
 * the SCIM connector.
 *
 * @param event API Gateway V2 event
 * @returns Proxied response
 */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const method = event.requestContext.http.method.toLowerCase() as AllowMethods;

  console.info(`Method: ${method}`);
  console.info(`Path: ${event.requestContext.http.path}`);
  console.info(`Body ${event.body}`);

  if (!allowedMethods.includes(method)) {
    return { statusCode: 405, headers: { allow: allowedMethods.join(',') } };
  }

  const body: unknown | undefined =
    event.body !== undefined ? JSON.parse(event.body) : undefined;

  const payloads = (body !== undefined
    ? patchBody(method, event.headers, event.requestContext.http.path, body)
    : [
        {
          data: body,
          headers: event.headers,
          method,
          path: event.requestContext.http.path,
        },
      ]) as ReadonlyArray<MetaPayload>;

  const groupedResponses = await payloads.reduce<
    Promise<ReadonlyArray<SafeAxiosResponse<unknown>>>
  >(async (acc, { data, headers, method: requestMethod, path }) => {
    const responses = await acc;

    const joinResponses = (
      prev: ReadonlyArray<SafeAxiosResponse<unknown>>,
      curr: SafeAxiosResponse<unknown> | void
    ): ReadonlyArray<SafeAxiosResponse<unknown>> =>
      curr === undefined ? prev : [...prev, curr];

    return new Promise((resolve, reject) =>
      sendRequest(requestMethod, headers, data, path)
        .then((response) => resolve(joinResponses(responses, response)))
        .catch((err: SafeAxiosResponse<unknown>) =>
          reject(joinResponses(responses, err))
        )
    );
  }, Promise.resolve([]));

  const finalResponse = groupedResponses[groupedResponses.length - 1];
  const responsePayload =
    finalResponse?.status === 204
      ? { id: event.requestContext.http.path.split('/').pop() }
      : finalResponse?.data;

  return {
    statusCode:
      Math.floor((finalResponse?.status ?? 500) / 100) === 2
        ? 200
        : finalResponse?.status,
    body: JSON.stringify(responsePayload),
    headers: finalResponse?.headers,
  };
};
