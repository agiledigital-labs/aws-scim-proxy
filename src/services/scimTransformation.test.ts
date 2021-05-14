/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import {
  modifyBody,
  constructOperationFromKeypair,
  constructOperations,
  convertMemberReplaceToSeparateOps,
  splitPatchToPatches,
  splitPutToPatch,
} from './scimTransformation';
import { ScimPatchOperation } from '../types/scim';
import { groupFixtures } from '../../.jest/fixtures';
import {
  fetchAllUsers,
  fetchUserGroupRelationship,
  fetchUsersInGroup,
} from './scimFetch';

jest.mock('./scimFetch');

describe('Scim payload transformation', () => {
  beforeAll(() => {
    // @ts-ignore
    fetchAllUsers.mockImplementation(jest.fn);

    // @ts-ignore
    fetchUserGroupRelationship.mockImplementation((args: unknown[]) =>
      // @ts-ignore
      jest.fn(...args)
    );

    // @ts-ignore
    fetchUsersInGroup.mockImplementation(() =>
      groupFixtures[
        // @ts-ignore
        fetchUserGroupRelationship.mock.calls.pop()[1]
      ]?.members.map((userId) => ({
        userId,
      }))
    );
  });

  it('should convert the replace members list to add / remove lists', async () => {
    const groupId = 'a358d675-46ef-5b6c-85ac-d8bbb1410e73';
    const membersList = [
      ...groupFixtures[groupId]!.members.slice(1),
      '98feceb2-1ea1-5a8a-b818-4eb19c32166a',
    ];

    const response = await convertMemberReplaceToSeparateOps(
      membersList,
      `/tenant-id/scim/v2/Groups/${groupId}`,
      {}
    );

    expect(response![0]).toEqual({
      op: 'add',
      path: 'members',
      value: membersList
        .filter((userId) => !groupFixtures[groupId]!.members.includes(userId))
        .map((userId) => ({ value: userId })),
    });

    expect(response![1]).toEqual({
      op: 'remove',
      path: 'members',
      value: groupFixtures[groupId]!.members.filter(
        (userId) => !membersList.includes(userId)
      ).map((userId) => ({ value: userId })),
    });
  });

  it('should return undefined for malformed path', async () => {
    const response = await convertMemberReplaceToSeparateOps([], '', {});

    expect(response).toBe(undefined);
  });

  it('should return undefined if there was upstream fetching errors', async () => {
    const response = await convertMemberReplaceToSeparateOps(
      [],
      '/tenant-id/scim/v2/Groups/invalid',
      {}
    );

    expect(response).toBe(undefined);
  });

  it('should convert a key-value pair to a replace operation', async () => {
    expect(
      await constructOperationFromKeypair(
        {},
        ``
      )(['name', { firstName: 'Bob', lastName: 'Jensen' }])
    ).toEqual({
      op: 'replace',
      path: 'name',
      value: { firstName: 'Bob', lastName: 'Jensen' },
    });

    expect(
      await constructOperationFromKeypair(
        {},
        ``
      )(['externalId', 'some-external-id'])
    ).toEqual({
      op: 'replace',
      path: 'externalId',
      value: 'some-external-id',
    });
  });

  it('should convert a key-value pair to a members add / remove operations', async () => {
    const groupId = 'a358d675-46ef-5b6c-85ac-d8bbb1410e73';
    const membersList = [
      ...groupFixtures[groupId]!.members.slice(1),
      '98feceb2-1ea1-5a8a-b818-4eb19c32166a',
    ];

    const response = (await constructOperationFromKeypair(
      {},
      `/tenant-id/scim/v2/Groups/${groupId}`
    )([
      'members',
      membersList.map((userId) => ({ value: userId })),
    ])) as ScimPatchOperation['Operations'];

    expect(response![0]).toEqual(
      expect.objectContaining({
        value: membersList
          .filter((userId) => !groupFixtures[groupId]!.members.includes(userId))
          .map((userId) => ({ value: userId })),
      })
    );

    expect(response![1]).toEqual(
      expect.objectContaining({
        value: groupFixtures[groupId]!.members.filter(
          (userId) => !membersList.includes(userId)
        ).map((userId) => ({ value: userId })),
      })
    );
  });

  it('should handle upstream fetch error for members operations', async () => {
    const response = (await constructOperationFromKeypair(
      {},
      `invalid`
    )(['members', []])) as ScimPatchOperation['Operations'];

    expect(response).toEqual([]);
  });

  it('should construct a list of operations', async () => {
    const groupId = 'a358d675-46ef-5b6c-85ac-d8bbb1410e73';
    const membersList = [
      ...groupFixtures[groupId]!.members.slice(1),
      '98feceb2-1ea1-5a8a-b818-4eb19c32166a',
    ];

    const response = await constructOperations(
      {},
      `/tenant-id/scim/v2/Groups/${groupId}`,
      [
        ['members', membersList.map((userId) => ({ value: userId }))],
        ['name', { firstName: 'Bob', lastName: 'Jensen' }],
      ]
    );

    expect(response![0]).toEqual(
      expect.objectContaining({
        value: membersList
          .filter((userId) => !groupFixtures[groupId]!.members.includes(userId))
          .map((userId) => ({ value: userId })),
      })
    );

    expect(response![1]).toEqual(
      expect.objectContaining({
        value: groupFixtures[groupId]!.members.filter(
          (userId) => !membersList.includes(userId)
        ).map((userId) => ({ value: userId })),
      })
    );

    expect(response![2]).toEqual(
      expect.objectContaining({
        value: { firstName: 'Bob', lastName: 'Jensen' },
      })
    );
  });

  it('should should split a ForgeRock patch to AWS Patch', async () => {
    const payload = {
      schemas: ['some-schema'],
      // @ts-ignore
      extraField: 'hello',
      Operations: [
        {
          op: 'replace',
          value: {
            id: 'some-aws-id',
            name: { firstName: 'Bob', lastName: 'Jensen' },
            emails: [{ value: 'bjensen@example.com', primary: true }],
          },
        },
        {
          op: 'replace',
          value: {
            externalId: 'some-external-id',
            displayName: 'Bob Jensen',
          },
        },
      ],
    };

    // @ts-ignore
    const response = await splitPatchToPatches('patch', {}, '', payload);

    expect(response.data).toEqual({
      extraField: 'hello',
      schemas: [expect.stringContaining('PatchOp')],
      Operations: payload.Operations.flatMap(({ value: entries }) =>
        Object.entries(entries)
          .map(([key, value]) => ({
            op: 'replace',
            path: key,
            value,
          }))
          .filter(({ path }) => path !== 'id')
      ),
    });
  });

  it('should should split a ForgeRock put to AWS Patch', async () => {
    const payload = {
      schemas: ['some-schema'],
      id: 'some-aws-id',
      name: { firstName: 'Bob', lastName: 'Jensen' },
      emails: [{ value: 'bjensen@example.com', primary: true }],
      externalId: 'some-external-id',
      displayName: 'Bob Jensen',
    };

    // @ts-ignore
    const response = await splitPutToPatch('put', {}, payload);

    expect(response.data).toEqual({
      schemas: [expect.stringContaining('PatchOp')],
      Operations: Object.entries(payload)
        .map(([key, value]) => ({
          op: 'replace',
          path: key,
          value,
        }))
        .filter(({ path }) => path !== 'id' && path !== 'schemas'),
    });
  });

  it('should modify ForgeRock put request', async () => {
    const payload = {
      externalId: 'some-external-id',
    };

    const response = await modifyBody('put', {}, '', payload);

    expect(response.data).toEqual({
      schemas: [expect.stringContaining('PatchOp')],
      Operations: Object.entries(payload).map(([key, value]) => ({
        op: 'replace',
        path: key,
        value,
      })),
    });
  });

  it('should modify ForgeRock patch request', async () => {
    const payload = {
      externalId: 'some-external-id',
    };

    const response = await modifyBody('patch', {}, '', {
      Operations: [{ op: 'replace', value: payload }],
    });

    expect(response.data).toEqual({
      schemas: [expect.stringContaining('PatchOp')],
      Operations: Object.entries(payload).map(([key, value]) => ({
        op: 'replace',
        path: key,
        value,
      })),
    });
  });

  it('should not modify non patch or put requests', async () => {
    const payload = {
      externalId: 'some-external-id',
    };

    const response = await modifyBody('post', {}, '', payload);

    expect(response.data).toEqual(payload);
  });
});
