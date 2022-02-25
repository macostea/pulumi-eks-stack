import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import * as k8s from "@pulumi/kubernetes";

function createCertManager(cluster: eks.Cluster) {
    const certManager = new k8s.yaml.ConfigFile("cert-manager", {
        file: "https://github.com/cert-manager/cert-manager/releases/download/v1.5.3/cert-manager.yaml"
    }, {
        provider: cluster.provider
    });

    return certManager;
}

function createServiceAccount(cluster: eks.Cluster, albIngressControllerRole: aws.iam.Role) {
    const sa = new k8s.core.v1.ServiceAccount("aws-load-balancer-controller", {
        metadata: {
            namespace: "kube-system",
            name: "aws-load-balancer-controller",
            annotations: {
                "eks.amazonaws.com/role-arn": albIngressControllerRole.arn,
            }
        }
    }, {
        provider: cluster.provider
    });

    return sa;
}

export function createAlbIngressController(clusterName: string, cluster: eks.Cluster, albIngressControllerRole: aws.iam.Role) {
    const certManager = createCertManager(cluster);
    const sa = createServiceAccount(cluster, albIngressControllerRole);
    const albIngressController = new k8s.helm.v3.Chart("aws-load-balancer-controller", {
        chart: "aws-load-balancer-controller",
        namespace: "kube-system",
        fetchOpts: {
            repo: "https://aws.github.io/eks-charts",
        },
        values: {
            clusterName: clusterName,
            image: {
                repository: "602401143452.dkr.ecr.eu-central-1.amazonaws.com/amazon/aws-load-balancer-controller" // TODO: Find a way to not hardcode this
            },
            serviceAccount: {
                create: false,
                name: sa.metadata.name,
            },
            enableCertManager: true
        }
    }, {
        provider: cluster.provider,
        dependsOn: [certManager]
    });

    return albIngressController;
}
