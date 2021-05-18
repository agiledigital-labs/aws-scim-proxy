/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import axios from 'axios';
import { URL } from 'url';
import { ScimResponse, ScimUser } from '../types/scim';
import {
  AllowMethods,
  fetchUsersInGroup,
  fetchUserGroupRelationship,
  fetchAllUsers,
  sendRequest,
  SafeAxiosResponse,
} from './scimFetch';

import { groupFixtures, userFixtures } from '../../.jest/fixtures';

jest.mock('axios');

// Reduce console noise in tests
console.trace = jest.fn();

const proxy = process.env.PROXY_URL!;
const host = new URL(proxy).hostname;

describe('Scim service', () => {
  beforeAll(() => {
    // @ts-ignore
    axios.mockImplementation(
      (
        url: string,
        {
          data,
          validateStatus,
        }: {
          method: AllowMethods;
          data: { status?: number } & Record<string, unknown>;
          // eslint-disable-next-line no-unused-vars
          validateStatus: (code: number) => boolean;
        }
      ) => {
        if (data?.status !== undefined) {
          if (validateStatus !== undefined && !validateStatus(data.status)) {
            // eslint-disable-next-line prefer-promise-reject-errors
            return Promise.reject({ status: data.status });
          }

          if (validateStatus !== undefined && validateStatus(data.status)) {
            return { status: data.status };
          }

          if (data.status >= 400) {
            // eslint-disable-next-line prefer-promise-reject-errors
            return Promise.reject({ status: data.status });
          }

          return { status: data.status };
        }

        if (url.endsWith('/Users')) {
          return { status: 200, data: userFixtures };
        }

        if (url.includes('/Groups?filter')) {
          const [, groupId, memberId] = url.match(
            /filter=id eq "([A-z0-9-]+)" and members eq "([A-z0-9-]+)"/
          ) as RegExpMatchArray;

          return {
            status: 200,
            data: {
              Resources: groupFixtures[groupId!]?.members.includes(memberId!)
                ? [{ id: groupId }]
                : [],
            },
          };
        }

        return { status: 200 };
      }
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully send a get request', async () => {
    await sendRequest(
      'get',
      { 'content-length': '100', authorization: 'Bearer token' },
      undefined,
      ''
    );

    expect(axios).toHaveBeenLastCalledWith(
      proxy,
      expect.objectContaining({
        method: 'get',
        headers: { host, authorization: 'Bearer token' },
        data: undefined,
      })
    );
  });

  it('should reject upstream errors if validate status is disabled', async () => {
    await expect(
      sendRequest('get', {}, { status: 500 }, '', false)
    ).rejects.toEqual({ status: 500 });
  });

  it('should resolve upstream errors if validate status is enabled', async () => {
    expect(await sendRequest('get', {}, { status: 500 }, '', true)).toEqual({
      status: 500,
    });
  });

  it('should fetch all users', async () => {
    const response = await fetchAllUsers('', {})();

    expect(axios).toHaveBeenLastCalledWith(
      `${proxy}/Users`,
      expect.objectContaining({})
    );
    expect(response.data).toEqual(userFixtures);
  });

  it('should fetch a valid user group relationship', async () => {
    const response = await fetchUserGroupRelationship(
      '',
      'a8a90f06-89fc-5633-9205-0f37699f0eb6',
      {}
    )('98feceb2-1ea1-5a8a-b818-4eb19c32166a');

    expect(axios).toHaveBeenLastCalledWith(
      expect.stringContaining('/Groups?filter'),
      expect.objectContaining({})
    );
    expect(response).toEqual({ id: 'a8a90f06-89fc-5633-9205-0f37699f0eb6' });
  });

  it("shouldn't fetch a user group relationship", async () => {
    const response = await fetchUserGroupRelationship(
      '',
      'a8a90f06-89fc-5633-9205-0f37699f0eb6',
      {}
    )('edf32347-6d27-533f-a8ee-2898c657a184');

    expect(axios).toHaveBeenLastCalledWith(
      expect.stringContaining('/Groups?filter'),
      expect.objectContaining({})
    );
    expect(response).toEqual(undefined);
  });

  it('should fetch users in a group', async () => {
    const allUsers = async (): Promise<
      SafeAxiosResponse<ScimResponse<ScimUser>>
      // @ts-ignore
    > => ({ data: { Resources: Object.values(userFixtures) } });
    const fetchUserGroupRelations = async (userId: string) =>
      groupFixtures['a358d675-46ef-5b6c-85ac-d8bbb1410e73']?.members.includes(
        userId
      )
        ? { id: 'a358d675-46ef-5b6c-85ac-d8bbb1410e73' }
        : undefined;

    const response = await fetchUsersInGroup(
      allUsers,
      fetchUserGroupRelations
    )();

    expect(response).toEqual(
      groupFixtures[
        'a358d675-46ef-5b6c-85ac-d8bbb1410e73'
      ]?.members.map((userId) => expect.objectContaining({ userId }))
    );
  });
});
