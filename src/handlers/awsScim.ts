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

type ScimPatchOperation = {
  schemas: ReadonlyArray<string>;
  Operations: ReadonlyArray<{
    op: 'add' | 'replace' | 'remove';
    path?: string;
    value:
      | unknown
      | Record<string, unknown>
      | ReadonlyArray<Record<string, unknown>>;
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

const badHeaders = ['content-length', 'host'];

/**
 * Removes headers which cause issues with the proxy
 *
 * @param headers object of headers to be proxied
 * @returns clean headers
 */
const headerFilter = (
  headers: APIGatewayProxyEventHeaders
): APIGatewayProxyEventHeaders =>
  Object.fromEntries(
    Object.entries(headers).filter(([key]) => !badHeaders.includes(key))
  );

/**
 * Sends a request to the AWS SCIM endpoint
 *
 * @param method http method to use
 * @param headers headers to send
 * @param data payload for post, patch or put methods
 * @param path location of resource
 * @returns response from request
 */
const sendRequest = async <T extends unknown>(
  method: AllowMethods,
  headers: APIGatewayProxyEventHeaders,
  data: unknown,
  path: string
): Promise<SafeAxiosResponse<T>> =>
  axios(`${env.PROXY_URL}${path}`, {
    method,
    headers: {
      ...headerFilter(headers),
      host: new URL(env.PROXY_URL).hostname,
    },
    data,
    validateStatus: () => true,
  });

/**
 * Gets the AWS SSO tenant id and group id from a path
 *
 * @param path location of resource
 * @returns tenant id and group id
 */
const getTenancyAndGroupFromPath = (path: string): [string, string] =>
  new RegExp('(/[A-z0-9-]+/scim/v2)/Groups/([A-z0-9-]+)')
    .exec(path)
    ?.slice(1) as [string, string];

/**
 *
 *
 * @param path location of resource
 * @param headers apigateway headers for proxy
 * @returns users in the group from the path
 */
const fetchUsersInGroup = async (
  path: string,
  headers: APIGatewayProxyEventHeaders
) => {
  // Implement pagination. Max 50 users per request
  const fetchAllUsers = async (rawPath: string) =>
    sendRequest<{
      Resources: ReadonlyArray<{ id: string }>;
    }>('get', headers, undefined, `${rawPath}/Users`);

  const fetchUserGroupRelationship = async (
    rawPath: string,
    groupId: string,
    userId: string
  ) =>
    (
      await sendRequest<{ Resources: ReadonlyArray<unknown> }>(
        'get',
        headers,
        undefined,
        `${rawPath}/Groups?filter=id eq "${groupId}" and members eq "${userId}"`
      )
    ).data.Resources[0];

  const [rawPath, groupId] = getTenancyAndGroupFromPath(path);

  if (rawPath === undefined || groupId === undefined) {
    return undefined;
  }

  const membersList = await fetchAllUsers(rawPath);

  const relationships = (
    await Promise.all(
      membersList.data.Resources.map(async ({ id }) => ({
        userId: id,
        group: await fetchUserGroupRelationship(rawPath, groupId, id),
      }))
    )
  ).filter(({ group }) => group !== undefined);

  return relationships;
};

/**
 * Replaces the ForgeRock member operation replace with an AWS certified
 * operation.
 *
 * @param membersList forgerock members list
 * @param groupPath location of resource
 * @param headers apigateway headers for proxy
 * @returns AWS accepted operations for members update
 */
const convertMemberReplaceToSeparateOps = async (
  membersList: ReadonlyArray<string>,
  groupPath: string,
  headers: APIGatewayProxyEventHeaders
): Promise<
  ReadonlyArray<ScimPatchOperation['Operations'][number]> | undefined
> => {
  const currentGroupMembers = await fetchUsersInGroup(groupPath, headers);

  if (currentGroupMembers === undefined) {
    return undefined;
  }

  // To be removed from group. Delete op
  const removedMembers = currentGroupMembers.reduce<ReadonlyArray<string>>(
    (acc, { userId }) =>
      membersList.includes(userId) ? acc : [...acc, userId],
    []
  );

  // To be added to group. Create op
  const additionMembers = membersList.reduce<ReadonlyArray<string>>(
    (acc, curr) =>
      currentGroupMembers.filter(({ userId }) => userId === curr).length === 0
        ? [...acc, curr]
        : acc,
    []
  );

  return [
    {
      op: 'add',
      path: 'members',
      value: additionMembers.map((userId) => ({ value: userId })),
    },
    {
      op: 'remove',
      path: 'members',
      value: removedMembers.map((userId) => ({ value: userId })),
    },
  ];
};

/**
 * Convert ForgeRock body to AWS operations
 *
 * @param headers ApiGateway headers from proxy
 * @param path location of resource
 * @returns AWS accepted operations
 */
const constructOperationFromKeypair = (
  headers: APIGatewayProxyEventHeaders,
  path: string
) => async ([key, value]: [string, unknown | ReadonlyArray<unknown>]): Promise<
  ScimPatchOperation['Operations'] | ScimPatchOperation['Operations'][number]
> => {
  if (key === 'members') {
    const multiOperation = await convertMemberReplaceToSeparateOps(
      (value as ReadonlyArray<{ value: string }>).map(
        (memberMeta) => memberMeta.value
      ),
      path,
      headers
    );

    return multiOperation ?? [];
  }

  return {
    op: 'replace',
    path: key,
    value: value as Record<string, unknown>,
  };
};

/**
 * Transform patch request to an multi-operation patch request
 *
 * @param method apigateway proxied method
 * @param headers apigateway proxied headers
 * @param path location of resource
 * @param body apigateway proxied body
 * @returns AWS accepted operations
 */
const splitPatchToPatches = async (
  method: AllowMethods,
  headers: APIGatewayProxyEventHeaders,
  path: string,
  body: ScimPatchOperation
): Promise<MetaPayload<ScimPatchOperation>> => {
  const operations = await Promise.all(
    body.Operations.map(async (opsPayload) => {
      const rest = Object.entries({
        ...(opsPayload.value as Record<string, unknown>),
        schemas: undefined,
      });

      const remappedOperations = await Promise.all(
        rest.map(constructOperationFromKeypair(headers, path))
      );

      return remappedOperations
        .reduce<ScimPatchOperation['Operations']>(
          (acc, curr) =>
            Array.isArray(curr) ? [...acc, ...curr] : [...acc, curr],
          []
        )
        .filter(
          (operation) =>
            operation.value !== undefined &&
            (Array.isArray(operation.value) ? operation.value.length > 0 : true)
        );
    })
  );

  return {
    method,
    headers,
    path,
    data: {
      ...body,
      Operations: operations.flat(),
    },
  };
};

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

const patchBody = async (
  method: AllowMethods,
  headers: APIGatewayProxyEventHeaders,
  path: string,
  body: unknown
): Promise<MetaPayload<GroupOperations>> => {
  switch (method) {
    case 'patch':
      return splitPatchToPatches(
        method,
        headers,
        path,
        body as ScimPatchOperation
      );
    case 'put':
      return splitPutToPatch(headers, path, body as ScimPutOperation);
    default:
      return { data: body as GroupOperations, headers, path, method };
  }
};

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const method = event.requestContext.http.method.toLowerCase() as AllowMethods;

  if (!allowedMethods.includes(method)) {
    return { statusCode: 405, headers: { allow: allowedMethods.join(',') } };
  }

  const body: unknown | undefined =
    event.body !== undefined ? JSON.parse(event.body) : undefined;

  const payloads = [
    body !== undefined
      ? await patchBody(
          method,
          event.headers,
          event.requestContext.http.path,
          body
        )
      : ({
          data: body,
          headers: event.headers,
          method,
          path: event.requestContext.http.path,
        } as MetaPayload),
  ];

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
    statusCode: finalResponse?.status === 204 ? 200 : finalResponse?.status,
    body: JSON.stringify(responsePayload),
    headers: finalResponse?.headers,
  };
};
