import * as eks from "@pulumi/eks";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { createEKSIAMRoles, EKSIAMRolesResult } from "./iam";
import { createNodeGroups } from "./workers";

function createCluster(clusterName: string, roles: EKSIAMRolesResult) {
    const cluster = new eks.Cluster(clusterName, {
        version: "1.21",
        roleMappings: [
            {
                roleArn: roles.admins.arn,
                groups: ["system:masters"],
                username: "admin",
            },
            // Also created a devs role but it's not mapped here yet for simplicity.
        ],
        instanceRoles: [
            roles.admins,
            roles.devs,
            roles.stdNodegroup,
            roles.perfNodegroup
        ],
        skipDefaultNodeGroup: true,
    });

    new k8s.rbac.v1.ClusterRole("clusterAdminRole", {
        metadata: {
            name: "clusterAdminRole",
        },
        rules: [{
            apiGroups: [""],
            resources: ["*"],
            verbs: ["*"],
        }],
    }, { provider: cluster.provider });

    new k8s.rbac.v1.ClusterRoleBinding("clusterAdminBinding", {
        metadata: {
          name: "clusterAdminBinding",
        },
        subjects: [{ 
           kind: "User",
           name: "admin",
        }], 
        roleRef: {
          kind: "ClusterRole",
          name: "clusterAdminRole",
          apiGroup: "rbac.authorization.k8s.io",
        },
      }, {provider: cluster.provider});

    return cluster;
}

export function createEKSCluster(clusterName: string) {
    const roles = createEKSIAMRoles();
    const cluster = createCluster(clusterName, roles);
    const nodeGroups = createNodeGroups(cluster, roles);

    return cluster;
};
