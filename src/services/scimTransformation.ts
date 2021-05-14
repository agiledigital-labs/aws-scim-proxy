import { APIGatewayProxyEventHeaders } from 'aws-lambda';
import { getTenancyAndGroupFromPath } from '../common/utils';
import {
  ScimPatchOperation,
  ScimPutOperation,
  ScimGroupOperations,
} from '../types/scim';
import {
  fetchUsersInGroup,
  fetchAllUsers,
  fetchUserGroupRelationship,
  AllowMethods,
} from './scimFetch';

export type MetaPayload<T = unknown> = {
  data: T;
  headers: APIGatewayProxyEventHeaders;
  method: AllowMethods;
  path: string;
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
export const convertMemberReplaceToSeparateOps = async (
  membersList: ReadonlyArray<string>,
  groupPath: string,
  headers: APIGatewayProxyEventHeaders
): Promise<
  ReadonlyArray<ScimPatchOperation['Operations'][number]> | undefined
> => {
  const [rawPath, groupId] = getTenancyAndGroupFromPath(groupPath) ?? [
    undefined,
  ];

  if (rawPath === undefined || groupId === undefined) {
    return undefined;
  }

  const currentGroupMembers = await fetchUsersInGroup(
    fetchAllUsers(rawPath, headers),
    fetchUserGroupRelationship(rawPath, groupId, headers)
  );

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
export const constructOperationFromKeypair = (
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
 * Creates an array of operations for a patch request. Removes operations which
 * don't have a purpose as part of the patch.
 *
 * @param headers ApiGateway headers from proxy
 * @param path location of resource
 * @param keyValueSet Key values from the request
 * @returns array of operations
 */
export const constructOperations = async (
  headers: APIGatewayProxyEventHeaders,
  path: string,
  keyValueSet: Array<[string, unknown]>
): Promise<ReadonlyArray<ScimPatchOperation['Operations'][number]>> => {
  const remappedOperations = await Promise.all(
    keyValueSet.map(constructOperationFromKeypair(headers, path))
  );

  return remappedOperations
    .reduce<ScimPatchOperation['Operations']>(
      (acc, curr) => (Array.isArray(curr) ? [...acc, ...curr] : [...acc, curr]),
      []
    )
    .filter(
      (operation) =>
        operation.value !== undefined &&
        (Array.isArray(operation.value) ? operation.value.length > 0 : true)
    );
};

/**
 * Transform patch request to an multi-operation patch request
 *
 * @param method ApiGateway proxied method
 * @param headers ApiGateway proxied headers
 * @param path location of resource
 * @param body ApiGateway proxied body
 * @returns AWS accepted operations
 */
export const splitPatchToPatches = async (
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
        id: undefined,
      });

      return constructOperations(headers, path, rest);
    })
  );

  return {
    method,
    headers,
    path,
    data: {
      ...body,
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: operations.flat(),
    },
  };
};

/**
 * Modifies the put request to a patch request using the correct schemas
 *
 * @param headers apigateway proxied method
 * @param path location of resource
 * @param body apigateway proxied body
 * @returns patch request with all the changes as operations
 */
export const splitPutToPatch = async (
  headers: APIGatewayProxyEventHeaders,
  path: string,
  body: ScimPutOperation
): Promise<MetaPayload<ScimPatchOperation>> => {
  const rest = Object.entries({ ...body, id: undefined, schemas: undefined });

  return {
    data: {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: await constructOperations(headers, path, rest),
    },
    headers,
    method: 'patch',
    path,
  };
};

/**
 * Determines how the body needs to be modified to be AWS SCIM schema compliant.
 *
 * @param method ApiGateway proxied method
 * @param headers ApiGateway proxied headers
 * @param path location of resource
 * @param body ApiGateway proxied body
 * @returns request information with data that is schema compliant
 */
export const modifyBody = async (
  method: AllowMethods,
  headers: APIGatewayProxyEventHeaders,
  path: string,
  body: unknown
): Promise<MetaPayload<ScimGroupOperations>> => {
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
      return { data: body as ScimGroupOperations, headers, path, method };
  }
};
