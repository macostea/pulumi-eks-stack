import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as eks from "@pulumi/eks"

import * as fs from "fs";
import * as path from "path";

function createAdminRole() {
    // Create the EKS cluster admins role.
    const adminsName = "admins";
    const adminsIamRole = new aws.iam.Role(`${adminsName}-eksClusterAdmin`, {
        assumeRolePolicy: aws.getCallerIdentity().then(id =>
            aws.iam.assumeRolePolicyForPrincipal({"AWS": `arn:aws:iam::${id.accountId}:root`}))
    })
    const adminsIamRolePolicy = new aws.iam.RolePolicy(`${adminsName}-eksClusterAdminPolicy`, {
        role: adminsIamRole,
        policy: {
            Version: "2012-10-17",
            Statement: [
                { Effect: "Allow", Action: ["eks:*", "ec2:DescribeImages"], Resource: "*", },
                { Effect: "Allow", Action: "iam:PassRole", Resource: "*"},
            ],
        },
    },
        { parent: adminsIamRole },
    );

    return adminsIamRole;
}

function createDeveloperRole() {
    // Create the EKS cluster developers role.
    const devName = "devs";
    const devsIamRole = new aws.iam.Role(`${devName}-eksClusterDeveloper`, {
        assumeRolePolicy: aws.getCallerIdentity().then(id =>
            aws.iam.assumeRolePolicyForPrincipal({"AWS": `arn:aws:iam::${id.accountId}:root`}))
    })

    return devsIamRole;
}

// Attach policies to a role.
function attachPoliciesToRole(name: string, role: aws.iam.Role, policyArns: Map<string, pulumi.Input<aws.ARN>>) {
    for (const policyArn of policyArns) {
        new aws.iam.RolePolicyAttachment(`${name}-${policyArn[0]}`,
            { policyArn: policyArn[1], role: role },
        );
    }
}

function createNodeGroupRoles() {
    // Create fluentd policy.
    const fluentdCloudWatchPolicy = new aws.iam.Policy("fluentd-cloudwatch-policy",
        {
            description: "Allows fluentd-cloudwatch to work with CloudWatch Logs.",
            policy: JSON.stringify(
                {
                    Version: "2012-10-17",
                    Statement: [{Effect: "Allow", Action: ["logs:*"], Resource: ["arn:aws:logs:*:*:*"]}]
                }
            )
        },
    );

    // The managed policies EKS requires of nodegroups join a cluster.
    const nodegroupManagedPolicyArns = new Map<string, pulumi.Input<aws.ARN>>([
        ["AmazonEKSWorkerNodePolicy", "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"],
        ["AmazonEKS_CNI_Policy", "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"],
        ["AmazonEC2ContainerRegistryReadOnly", "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"],
        ["fluentd-cloudwatch-policy", fluentdCloudWatchPolicy.arn],
    ]);

    // Create the standard node group worker role and attach the required policies.
    const stdName = "standardNodeGroup";
    const stdNodegroupIamRole = new aws.iam.Role(`${stdName}-eksClusterWorkerNode`, {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({"Service": "ec2.amazonaws.com"})
    });
    attachPoliciesToRole(stdName, stdNodegroupIamRole, nodegroupManagedPolicyArns);
    

    // Create the performant node group worker role and attach the required policies.
    const perfName = "performanceNodeGroup";
    const perfNodegroupIamRole = new aws.iam.Role(`${perfName}-eksClusterWorkerNode`, {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({"Service": "ec2.amazonaws.com"})
    });
    attachPoliciesToRole(perfName, perfNodegroupIamRole, nodegroupManagedPolicyArns);

    return {
        stdNodegroupIamRole,
        perfNodegroupIamRole,
    };
}

export interface EKSIAMRolesResult {
    admins: aws.iam.Role;
    devs: aws.iam.Role;
    stdNodegroup: aws.iam.Role;
    perfNodegroup: aws.iam.Role;
}

export function createEKSIAMRoles(): EKSIAMRolesResult {
    const adminRole = createAdminRole();
    const devRole = createDeveloperRole();
    const nodeRoles = createNodeGroupRoles();

    return {
        admins: adminRole,
        devs: devRole,
        stdNodegroup: nodeRoles.stdNodegroupIamRole,
        perfNodegroup: nodeRoles.perfNodegroupIamRole,
    };
};


export function createClusterAutoscalerRole(cluster: eks.Cluster) {
    const clusterOidcProvider = cluster.core.oidcProvider!;

    const clusterAutoscalerRolePolicy = pulumi.all([clusterOidcProvider.arn]).apply(([arn])=>
        aws.iam.getPolicyDocument({
            statements: [
                {
                    actions: ["sts:AssumeRoleWithWebIdentity"],
                    effect: "Allow",
                    principals: [{ identifiers: [arn], type: "Federated" }],
                }
            ],
        })
    );

    const fullAccessPolicy = new aws.iam.Policy("autoscaler-full-access-policy", {
        policy: {
            Version: "2012-10-17",
            Statement: [
                {
                    Effect: "Allow",
                    Action: ["autoscaling:*", "ec2:DescribeLaunchTemplateVersions"],
                    Resource: "*",
                },
            ],
        },
    });

    const autoscalerServiceRole = new aws.iam.Role("autoscaler-eksClusterAutoscaler", {
        assumeRolePolicy: clusterAutoscalerRolePolicy.json,
    });

    const clusterAutoscalerRolePolicyAttachment = new aws.iam.RolePolicyAttachment("autoscaler-full-access-attachment", {
        policyArn: fullAccessPolicy.arn,
        role: autoscalerServiceRole,
    })

    return autoscalerServiceRole;
}

export function createAlbIngressRole(cluster: eks.Cluster) {
    const clusterOidcProvider = cluster.core.oidcProvider!;
    // Create IAM Policy for the IngressController.
    const albRolePolicy = pulumi.all([clusterOidcProvider.arn]).apply(([arn])=>
        aws.iam.getPolicyDocument({
            statements: [
                {
                    actions: ["sts:AssumeRoleWithWebIdentity"],
                    effect: "Allow",
                    principals: [{ identifiers: [arn], type: "Federated" }],
                }
            ],
        })
    );

    const albPolicyFile = fs.readFileSync(path.join(__dirname, "alb-iam_policy.json"), "utf8");
    const ingressControllerPolicy = new aws.iam.Policy("AWSLoadBalancerControllerIAMPolicy", {
        policy: albPolicyFile
    });

    const albIngressControllerRole = new aws.iam.Role("aws-load-balancer-controller-role", {
        assumeRolePolicy: albRolePolicy.json,
    });

    new aws.iam.RolePolicyAttachment("albIngressControllerPolicyAttachment", {
        policyArn: ingressControllerPolicy.arn,
        role: albIngressControllerRole,
    });

    return albIngressControllerRole;
}
