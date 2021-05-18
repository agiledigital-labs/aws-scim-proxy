import { getTenancyAndGroupFromPath } from './utils';

describe('Utils', () => {
  it('should get AWS sso tenant id and group id from path', () => {
    const response = getTenancyAndGroupFromPath(
      '/tenant-id/scim/v2/Groups/group-id/'
    );

    expect(response).toEqual(['/tenant-id/scim/v2', 'group-id']);
  });
});
