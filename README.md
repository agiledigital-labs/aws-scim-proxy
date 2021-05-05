# AWS SCIM Proxy

The ForgeRock SCIM connector doesn't work nor is compliant with the SCIM
requirements for AWS SSO. This Proxy which uses Api Gateway V2 and Lambda
modifies the payloads so the schema meets AWS requirements.

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
This will prevent all unknown requests been sent to the proxy

## Deploy

Serverless Framework is used to deploy the project to AWS.
To run Serverless run the command `yarn sls deploy -v

Both of the environment variables can be passed by the command by using
`--proxy-url` and `--aws-tenant-id`.
