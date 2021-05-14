/**
 * Gets the AWS SSO tenant id and group id from a path
 *
 * @param path location of resource
 * @returns tenant id and group id
 */
export const getTenancyAndGroupFromPath = (
  path: string
): [string, string] | undefined =>
  new RegExp(/(\/[A-z0-9-]+\/scim\/v2)\/Groups\/([A-z0-9-]+)/)
    .exec(path)
    ?.slice(1) as [string, string];
