import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export function createCodePipeline(githubConnectionId: string) {
    const awsRegion = aws.getRegion().then(region => region.name);
    const awsAccountId = aws.getCallerIdentity().then(identity => identity.accountId);
    const githubConnectionArn = pulumi.interpolate`arn:aws:codestar-connections:${awsRegion}:${awsAccountId}:connection/${githubConnectionId}`;

    const pipelineRole = new aws.iam.Role("pipeline-role", {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
            Service: "codepipeline.amazonaws.com",
        }),
    }, {
        deleteBeforeReplace: true,
    });

    const codePipelineBucket = new aws.s3.Bucket("pulumi-eks-stack-pipeline-bucket", {acl: "private"});

    const buildRole = new aws.iam.Role("build-policy", {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
            Service: "codebuild.amazonaws.com",
        }),
    });

    const buildAccess = new aws.iam.RolePolicyAttachment("codebuild-access", {
        role: buildRole,
        policyArn: aws.iam.ManagedPolicies.AWSCodeBuildDeveloperAccess
    });

    const cloudWatchAccess = new aws.iam.RolePolicyAttachment("cloudwatch-access", {
        role: buildRole,
        policyArn: aws.iam.ManagedPolicies.CloudWatchFullAccess
    });

    const s3Access = new aws.iam.RolePolicyAttachment("s3-access", {
        role: buildRole,
        policyArn: aws.iam.ManagedPolicies.AmazonS3FullAccess
    });

    const secretAccessPolicy = new aws.iam.RolePolicy("secret-access-policy", {
        role: buildRole,
        policy: pulumi.interpolate`{
        "Version": "2012-10-17",
        "Statement": [
            {
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
                "secretsmanager:ListSecretVersionIds",
                "secretsmanager:ListSecrets"
            ],
            "Resource": "*"
            }
        ]
        }`,
    });

    const buildProject = new aws.codebuild.Project("pulumi-eks-stack-build", {
        artifacts: { type: "CODEPIPELINE" },
        buildTimeout: 10,
        serviceRole: buildRole.arn,
        environment: {
            computeType: "BUILD_GENERAL1_SMALL",
            image: "aws/codebuild/standard:5.0",
            type: "LINUX_CONTAINER",
            environmentVariables: [
                {
                    name: "PULUMI_ACCESS_TOKEN",
                    value: "PulumiStackSecret:PULUMI_ACCESS_TOKEN",
                    type: "SECRETS_MANAGER",
                },
            ],
            privilegedMode: true,
        },
        source: {
            type: "CODEPIPELINE",
            buildspec: "./codepipeline/buildspec.yml",
        }
    });

    const codePipeline = new aws.codepipeline.Pipeline("pulumi-eks-stack-codepipeline", {
        roleArn: pipelineRole.arn,
        artifactStore: {
            location: codePipelineBucket.bucket,
            type: "S3",
        },
        stages: [
            {
                name: "Source",
                actions: [
                    {
                        name: "Source",
                        category: "Source",
                        owner: "AWS",
                        provider: "CodeStarSourceConnection",
                        version: "1",
                        outputArtifacts: ["source_output"],
                        configuration: {
                            ConnectionArn: githubConnectionArn,
                            FullRepositoryId: "macostea/pulumi-eks-stack",
                            BranchName: "master",
                        },
                    },
                ],
            },
            {
                name: "Build",
                actions: [
                    {
                        name: "Build",
                        category: "Build",
                        owner: "AWS",
                        provider: "CodeBuild",
                        inputArtifacts: ["source_output"],
                        outputArtifacts: ["build_output"],
                        version: "1",
                        configuration: {
                            ProjectName: buildProject.name,
                        }
                    }
                ],
            },
        ]
    });

    const pipelineRolePolicy = new aws.iam.RolePolicy("pipeline-role-policy", {
        role: pipelineRole.id,
        policy: pulumi.interpolate`{
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect":"Allow",
                    "Action": [
                    "s3:GetObject",
                    "s3:GetObjectVersion",
                    "s3:GetBucketVersioning",
                    "s3:PutObjectAcl",
                    "s3:PutObject"
                    ],
                    "Resource": [
                    "${codePipelineBucket.arn}",
                    "${codePipelineBucket.arn}/*"
                    ]
                },
                {
                    "Effect": "Allow",
                    "Action": [
                    "codestar-connections:UseConnection"
                    ],
                    "Resource": "${githubConnectionArn}"
                },
                {
                    "Effect": "Allow",
                    "Action": [
                    "codebuild:BatchGetBuilds",
                    "codebuild:StartBuild"
                    ],
                    "Resource": "*"
                }
            ]
        }`,
    });

    return codePipeline;
}