import * as path from "path";
import * as eks from "@pulumi/eks";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import { createEKSIAMRoles, EKSIAMRolesResult, createClusterAutoscalerRole, createAlbIngressRole } from "./iam";
import { createNodeGroups } from "./workers";
import { createClusterAutoscaler } from "./clusterAutoscaler";
import { createFluentBit } from "./fluent-bit";
import { createAlbIngressController } from "./albIngressController";


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
            roles.perfNodegroup,
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
    const fluentdCloudwatch = createFluentBit(clusterName, cluster);
    const albIngressRole = createAlbIngressRole(cluster);
    const albIngressController = createAlbIngressController(clusterName, cluster, albIngressRole);
    const autoscalerRole = createClusterAutoscalerRole(cluster);
    autoscalerRole.arn.apply(autoscalerRoleArn => {
        createClusterAutoscaler(path.join(__dirname, "cluster-autoscaler-autodiscover.yaml"), outDirPath, autoscalerRoleArn, cluster);
    });

    return cluster;
};
