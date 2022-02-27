import * as pulumi from "@pulumi/pulumi";
import * as eks from "@pulumi/eks";
import { EKSIAMRolesResult } from "./iam";

export function createNodeGroups(cluster: eks.Cluster, roles: EKSIAMRolesResult) {
    // Create a Standard node group of t2.medium workers.
    const ngStandard = new eks.ManagedNodeGroup(`${pulumi.getProject()}-ng-standard`, {
        cluster: cluster,
        instanceTypes: ["t2.medium"],
        capacityType: "ON_DEMAND",
        scalingConfig: {
            desiredSize: 1,
            maxSize: 10,
            minSize: 1,
        },
        nodeRole: roles.stdNodegroup
        // Might want to pin the AMI ID here.
    }, {
        providers: { kubernetes: cluster.provider},
        ignoreChanges: ["scalingConfig.desiredSize"], // Let the cluster autoscaler handle this.
    });

    // Create a 2xlarge node group of t3.2xlarge workers.
    const ng2xlarge = new eks.ManagedNodeGroup(`${pulumi.getProject()}-ng-2xlarge`, {
        cluster: cluster,
        instanceTypes: ["t3.2xlarge"],
        capacityType: "ON_DEMAND",
        scalingConfig: {
            desiredSize: 0,
            maxSize: 10,
            minSize: 0,
        },
        nodeRole: roles.perfNodegroup
        // Might want to pin the AMI ID here.
    }, {
        providers: { kubernetes: cluster.provider},
    });
    
    return {
        ngStandard,
        ng2xlarge,
    };
}
