import type {
  APIGatewayProxyEventHeaders,
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { MetaPayload, modifyBody } from '../services/scimTransformation';

import {
  allowedMethods,
  AllowMethods,
  fetchAllUsers,
  fetchUserGroupRelationship,
  fetchUsersInGroup,
  SafeAxiosResponse,
  sendRequest,
} from '../services/scimFetch';
import { getTenancyAndGroupFromPath } from '../common/utils';
import { FetchGroupMembers } from '../types/fetch';

/**
 * Sets up the fetch group function along with the associated functions
 *
 * @param path location of resource
 * @param headers APIGateway proxied headers
 * @returns Curried fetch function
 */
const setupFetchFunctions = (
  path: string,
  headers: APIGatewayProxyEventHeaders
): FetchGroupMembers | undefined => {
  const [rawPath, groupId] = getTenancyAndGroupFromPath(path) ?? [undefined];

  if (rawPath === undefined || groupId === undefined) {
    return undefined;
  }

  return fetchUsersInGroup(
    fetchAllUsers(rawPath, headers),
    fetchUserGroupRelationship(rawPath, groupId, headers)
  );
};

/**
 * Handles a proxy endpoint from APIGatewayV2. Modifies put and patch payloads
 * and passes through the rest.
 *
 * @param event APIGatewayV2 event
 * @returns upstream response
 */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const method = event.requestContext.http.method.toLowerCase() as AllowMethods;

  if (!allowedMethods.includes(method)) {
    return { statusCode: 405, headers: { allow: allowedMethods.join(',') } };
  }

  const body: unknown | undefined =
    event.body !== undefined ? JSON.parse(event.body) : undefined;

  console.trace(
    `New Request: ${JSON.stringify({
      method,
      path: event.requestContext.http.path,
      body,
    })}`
  );

  const newRequest =
    body !== undefined
      ? await modifyBody(
          method,
          event.headers,
          event.requestContext.http.path,
          body,
          setupFetchFunctions(event.requestContext.http.path, event.headers)
        ).catch((rejection: SafeAxiosResponse<unknown>) => ({
          error: true,
          status: rejection.status,
          payload: rejection.data,
        }))
      : ({
          data: body,
          headers: event.headers,
          method,
          path: event.requestContext.http.path,
        } as MetaPayload);

  if (
    (newRequest as {
      error: boolean;
    }).error !== undefined
  ) {
    const { payload, status } = newRequest as {
      payload: string;
      status: number;
    };

    return {
      statusCode: status,
      body: payload,
    };
  }

  const response = await sendRequest(
    (newRequest as MetaPayload).method,
    (newRequest as MetaPayload).headers,
    (newRequest as MetaPayload).data,
    (newRequest as MetaPayload).path
  );

  const responsePayload =
    response.status === 204
      ? { id: event.requestContext.http.path.split('/').pop() }
      : response.data;

  return {
    statusCode: response.status === 204 ? 200 : response.status,
    body: JSON.stringify(responsePayload),
    headers: response.headers,
  };
};
