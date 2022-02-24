import * as aws from "@pulumi/aws";

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
function attachPoliciesToRole(name: string, role: aws.iam.Role, policyArns: string[]) {
    for (const policyArn of policyArns) {
        new aws.iam.RolePolicyAttachment(`${name}-${policyArn.split('/')[1]}`,
            { policyArn: policyArn, role: role },
        );
    }
}

function createNodeGroupRoles() {
    // The managed policies EKS requires of nodegroups join a cluster.
    const nodegroupManagedPolicyArns: string[] = [
        "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
        "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
        "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
    ];

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

function createClusterAutoscalerRole() {
    const autoscalerServiceRole = new aws.iam.Role(`autoscaler-eksClusterAutoscaler`, {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({"Service": "ec2.amazonaws.com"})
    });

    const clusterAutoscalerRolePolicy = new aws.iam.RolePolicy("clusterautoscaler-full-acess", {
        role: autoscalerServiceRole,
        policy: {
            Version: "2012-10-17",
            Statement: [
                { Effect: "Allow", Action: ["autoscaling:*", "ec2:DescribeLaunchTemplateVersions"], Resource: "*", },
            ],
        },
    })

    return autoscalerServiceRole;
}

export interface EKSIAMRolesResult {
    admins: aws.iam.Role;
    devs: aws.iam.Role;
    stdNodegroup: aws.iam.Role;
    perfNodegroup: aws.iam.Role;
    autoscaler: aws.iam.Role;
}

export function createEKSIAMRoles(): EKSIAMRolesResult {
    const adminRole = createAdminRole();
    const devRole = createDeveloperRole();
    const nodeRoles = createNodeGroupRoles();
    const autoscalerRole = createClusterAutoscalerRole();

    return {
        admins: adminRole,
        devs: devRole,
        stdNodegroup: nodeRoles.stdNodegroupIamRole,
        perfNodegroup: nodeRoles.perfNodegroupIamRole,
        autoscaler: autoscalerRole,
    };
};