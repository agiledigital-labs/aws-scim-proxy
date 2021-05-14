import { APIGatewayProxyEventHeaders } from 'aws-lambda';
import axios, { AxiosResponse } from 'axios';
import { URL } from 'url';
import axiosRetry from 'axios-retry';
import { env } from '../common/env';
import { ScimUser, ScimResponse } from '../types/scim';

axiosRetry(axios, {
  retries: 3,
  retryDelay: () => 1000,
  retryCondition: (error) => error.code === '429',
});

export const allowedMethods = [
  'get',
  'post',
  'patch',
  'put',
  'delete',
] as const;
export type AllowMethods = typeof allowedMethods[number];

export type SafeAxiosResponse<T> = Omit<AxiosResponse<T>, 'headers'> & {
  headers: Record<string, string | number | boolean>;
};

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
export const sendRequest = async <T extends unknown>(
  method: AllowMethods,
  headers: APIGatewayProxyEventHeaders,
  data: unknown,
  path: string,
  proxyStatus = true
): Promise<SafeAxiosResponse<T>> => {
  console.trace(
    `Sending Request Upstream ${JSON.stringify({ method, path, data })}`
  );

  const response = (await axios(`${env.PROXY_URL}${path}`, {
    method,
    headers: {
      ...headerFilter(headers),
      host: new URL(env.PROXY_URL).hostname,
    },
    data,
    validateStatus: proxyStatus ? () => true : undefined,
  })) as SafeAxiosResponse<T>;

  console.trace(
    `Received Response Upstream ${JSON.stringify({
      status: response.status,
      data: response.data,
    })}`
  );

  return response;
};

/**
 * Fetches all users from the AWS SCIM endpoint
 *
 * @param rawPath aws tenancy path
 * @param headers APIGateway headers
 * @returns list of users
 */
export const fetchAllUsers = (
  rawPath: string,
  headers: APIGatewayProxyEventHeaders
) => async (): Promise<SafeAxiosResponse<ScimResponse<ScimUser>>> =>
  sendRequest<ScimResponse<ScimUser>>(
    'get',
    headers,
    undefined,
    `${rawPath}/Users`,
    false
  );

/**
 * Fetches a relationship between an user and a group.
 *
 * @param rawPath aws tenancy path
 * @param groupId AWS group id
 * @param headers API Gateway proxied headers
 * @param userId AWS user id
 * @returns Relationship between the two entities
 */
export const fetchUserGroupRelationship = (
  rawPath: string,
  groupId: string,
  headers: APIGatewayProxyEventHeaders
) => async (userId: string): Promise<unknown | undefined> =>
  sendRequest<ScimResponse<unknown>>(
    'get',
    headers,
    undefined,
    `${rawPath}/Groups?filter=id eq "${groupId}" and members eq "${userId}"`,
    false
  ).then((payload) => payload.data.Resources[0]);

/**
 * Fetches all the users in a group
 *
 * @param fetchUsers function to fetch all the users
 * @param fetchUserGroupRelation function to fetch a group to user relationship
 * @returns list of users in a groups
 */
export const fetchUsersInGroup = async (
  fetchUsers: () => Promise<SafeAxiosResponse<ScimResponse<ScimUser>>>,
  fetchUserGroupRelation: (
    // eslint-disable-next-line no-unused-vars
    userId: string
  ) => Promise<unknown>
): Promise<ReadonlyArray<{ userId: string; group: unknown }>> => {
  const membersList = await fetchUsers();

  const relationships = (
    await Promise.all(
      membersList.data.Resources.map(async ({ id }) => ({
        userId: id,
        group: await fetchUserGroupRelation(id),
      }))
    )
  ).filter(({ group }) => group !== undefined);

  return relationships;
};
