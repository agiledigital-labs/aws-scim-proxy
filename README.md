# AWS SCIM Proxy

The ForgeRock SCIM connector doesn't work, nor is it compliant with the SCIM
requirements for AWS SSO. This proxy which uses API Gateway V2 and Lambda
modifies the payload, so the schema meets AWS requirements.

## Install

Clone the repository
Run the command `yarn install`

### Environment Variables

This project consumes a couple of environment variables for deployment and
runtime. We recommended using [direnv](https://direnv.net/) to manage these.

```shell
export PROXY_URL=https://scim.<AWS_REGION>.amazonaws.com
export AWS_TENANT_ID=<AWS TENANT UUID>
```

The `PROXY_URL` is the AWS host for the SCIM endpoint. You will need to change
the region to fit your needs.

The `AWS_TENANT_ID` is the first path parameter for your unique SCIM endpoint.
This will prevent all unknown requests from sent to the proxy.

## Deploy

Serverless Framework is used to deploy the project to AWS.
To run Serverless, run the command `yarn sls deploy -v

Both of the environment variables can be passed by the command by using
`--proxy-url` and `--aws-tenant-id`.

## Data Transformation

Transforming data is based on methods. `GET`, `POST` and `DELETE` methods are
passed through the proxy without modification. `PUT` and `PATCH` methods, their
payloads are modified.

### PUT requests

The ForgeRock SCIM connector has all the fields for an object in the root of the
request body. From our testing, the ForgeRock SCIM connector does not use the PUT
method to create a resource, only updating. See [MDN HTTP PUT method
reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/PUT) for a further explanation of the PUT method.

An expected PUT payload from the ForgeRock SCIM connector would look like the
following:

```json
{
  "id": "some-id",
  "schemas": ["some-schema"],
  "userName": "bjensen",
  "displayName": "Babs Jensen",
  "active": true,
  "emails": [
    { "value": "bjensen@example.com", "primary": true, "type": "work" }
  ]
}
```

The proxy will transform this into a PATCH request. It constructs each key-value
pair (other than id and schemas) into a patch replace operation. The expected
output from the proxy would be:

```json
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "userName", "value": "bjensen" },
    { "op": "replace", "path": "displayName", "value": "Babs Jensen" },
    { "op": "replace", "path": "active", "value": true },
    {
      "op": "replace",
      "path": "emails",
      "value": [
        { "value": "bjensen@example.com", "primary": true, "type": "work" },
        { "value": "babs123@example.com", "primary": false, "type": "personal" }
      ]
    }
  ]
}
```

### Patch requests

The ForgeRock SCIM connector has the entire object inside the value field within
an operation. The AWS SSO SCIM endpoint wants a singular value per operation with a
path that is key to the value. The ForgeRock SCIM connector operation is a
replace which the proxy respects.

An expected PATCH payload from the ForgeRock SCIM connector would look like the
following:

```json
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    {
      "op": "replace",
      "value": {
        "id": "some-id",
        "userName": "bjensen",
        "displayName": "Babs Jensen",
        "active": true,
        "emails": [
          { "value": "bjensen@example.com", "primary": true, "type": "work" }
        ]
      }
    }
  ]
}
```

The proxy will transform the singular operation into a multi-operation payload.
It constructs each key-value pair (other than id) into its own replace
operation. The expected output from the proxy would be:

```json
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "userName", "value": "bjensen" },
    { "op": "replace", "path": "displayName", "value": "Babs Jensen" },
    { "op": "replace", "path": "active", "value": true },
    {
      "op": "replace",
      "path": "emails",
      "value": [
        { "value": "bjensen@example.com", "primary": true, "type": "work" }
      ]
    }
  ]
}
```

### Member operations in PATCH payloads

The ForgeRock SCIM connector doesn't respect the AWS SSO SCIM endpoint's
requirements for member management within a group. The member's key-value pair
is located in the root object with everything else in the PUT request. See
the example above. The member's value is an array of string ids.

We have tested the replace operation with members which AWS offers on their
endpoint. We were unable to get this working. See the [documentation](https://docs.aws.amazon.com/singlesignon/latest/developerguide/sso-scim.pdf) for this
operation (Supported API Operations -> PatchGroup -> Member operations examples
-> Replace members in a group). Knowing that, the proxy uses create and remove
operations for members instead.

The expected payload from the ForgeRock SCIM connector would look like the
following:

```json
{
  "id": "some-id",
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    {
      "op": "replace",
      "value": [
        { "value": "4be0643f-1d98-573b-97cd-ca98a65347dd" },
        { "value": "86e3aed3-1553-5d23-8d61-2286215e65f1" },
        { "value": "20ca53af-d04c-58a2-a8b3-d02b9e414e80" }
      ]
    }
  ]
}
```

As the proxy does not know the difference between the ForgeRock group
memberships and the AWS SSO group memberships, it will create this in a
stateless form.

1. It will fetch all users on the AWS SSO through the SCIM connector. This is
   because the AWS SSO SCIM endpoint doesn't list member ids when fetching the
   group from the endpoint. This is listed on the AWS SSO SCIM endpoint
   [documentation](https://docs.aws.amazon.com/singlesignon/latest/developerguide/sso-scim.pdf) (Supported API Operations -> ListGroups -> Not supported).
2. Using the AWS SSO SCIM groups endpoint, the proxy will use a query to fetch
   the group relationship between the group and user. This returns an array of
   memberships. As the query expects either one or zero relationships, this is
   what is uses to understand if that user is in a relationship on the AWS SSO
   side.
3. With the knowledge from the ForgeRock SCIM connector about which members are
   to be with this group and the information derived from the AWS SSO SCIM
   endpoint, the proxy can create a diff. Members to be added, members who are
   staying and members to be removed.
4. Two operations will be created an add and remove operation. These will
   facilitate the member operations. The operations are added to the overall
   transformation of the PATCH request to the PATCH operations request.

The expected output from the proxy would be:

```json
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    {
      "op": "add",
      "path": "members",
      "value": [
        { "value": "4be0643f-1d98-573b-97cd-ca98a65347dd" },
        { "value": "86e3aed3-1553-5d23-8d61-2286215e65f1" }
      ]
    },
    {
      "op": "remove",
      "path": "members",
      "value": [{ "value": "20ca53af-d04c-58a2-a8b3-d02b9e414e80" }]
    }
  ]
}
```

From the two example payloads, this is what was expected. This would be the
current state of the group from ForgeRock and AWS SSO.

| ForgeRock Group                      | AWS SSO Group                        |
| ------------------------------------ | ------------------------------------ |
| 4be0643f-1d98-573b-97cd-ca98a65347dd |                                      |
| 86e3aed3-1553-5d23-8d61-2286215e65f1 |                                      |
| 6eabff02-c968-5cbc-bc7f-3b672928a761 | 6eabff02-c968-5cbc-bc7f-3b672928a761 |
|                                      | 20ca53af-d04c-58a2-a8b3-d02b9e414e80 |

ForgeRock SCIM connector sends a request that the users it listed are to be the
only users in the group. We can see from the above table that two of the users
are not currently in the group and need to be added to the group. One of the
users is already in the group and a final user that needs to be removed from the
group.

## Notes on proxy

### Response statues

The proxy will forward all status codes to the downstream (ForgeRock) except in
the following cases.

1. PUT requests expect a 200 response code back. As the proxy is transforming
   these to a PATCH request, the AWS SSO SCIM endpoint returns a 204. A body
   will be constructed with the id of the resource, and the status code will be
   changed to 200 before sending the request downstream.

### 429 status from AWS SSO SCIM endpoint

If there are many requests sent to the AWS endpoint, it can return a 429 Too
Many Request status. As the proxy is stateless, the current request will be
cancelled, but future requests will be still proxied, resulting in further
errors. The AWS SSO SCIM endpoint will include the header `Retry-After` which
will not be respected.

### Header stripping

The `content-length` header will be stripped as it will be recalculated when the
upstream request is sent.

The `host` header will be stripped and replaced with the AWS SSO SCIM endpoint
hostname.
