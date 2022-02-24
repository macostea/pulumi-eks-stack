import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import * as k8s from "@pulumi/kubernetes";

export function createAlbIngressController(clusterName: string, cluster: eks.Cluster, albIngressControllerRole: aws.iam.Role) {
    const albIngressController = new k8s.helm.v3.Chart("alb", {
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
                create: "false",
                name: albIngressControllerRole.name,
            }
        }
    }, { provider: cluster.provider });

    return albIngressController;
}
