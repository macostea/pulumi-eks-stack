import * as path from "path";
import * as eks from "@pulumi/eks";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import { createEKSIAMRoles, EKSIAMRolesResult, createClusterAutoscalerRole } from "./iam";
import { createNodeGroups } from "./workers";
import { createClusterAutoscaler } from "./clusterAutoscaler";
import { createFluentd } from "./fluentd";


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
        enabledClusterLogTypes: ["api", "audit", "authenticator", "controllerManager", "scheduler"],
        createOidcProvider: true
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

export function createEKSCluster(outDirPath: string, clusterName: string) {
    const roles = createEKSIAMRoles();
    const cluster = createCluster(clusterName, roles);
    const nodeGroups = createNodeGroups(cluster, roles);
    const fluentdCloudwatch = createFluentd(clusterName, cluster);
    const autoscalerRole = createClusterAutoscalerRole(cluster);
    autoscalerRole.arn.apply(autoscalerRoleArn => {
        createClusterAutoscaler(path.join(__dirname, "cluster-autoscaler-autodiscover.yaml"), outDirPath, autoscalerRoleArn, cluster);
    });

    return cluster;
};
